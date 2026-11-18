"""Browser races with simulated session/model/catalog responses; no live MIS calls."""
import os, pathlib
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1]
def run(base, check):
    with sync_playwright() as pw:
        opts={'executable_path':os.environ['PLAYWRIGHT_EXECUTABLE_PATH']} if os.getenv('PLAYWRIGHT_EXECUTABLE_PATH') else {'channel':os.environ['PLAYWRIGHT_CHANNEL']} if os.getenv('PLAYWRIGHT_CHANNEL') else {}
        browser=pw.chromium.launch(headless=True,**opts)
        context=browser.new_context()
        context.route('**/race-test',lambda r:r.fulfill(body='<html><body></body></html>',content_type='text/html'))
        context.route('**/api/session-context',lambda r:r.fulfill(json={'context':'A'}))
        context.route('**/api/assistant/status',lambda r:r.fulfill(json={}))
        pages=[context.new_page(),context.new_page()]
        for p in pages:
            p.goto(base+'/race-test')
            p.add_script_tag(content="function isBookOutOfStock(){return false;} let release; async function loadBooksFromApi(){return new Promise(r=>release=()=>r([{id:1,title:'Test',status:'Active',inventory:100}]))}")
            for script in ['cart-state.js','assistant.js']: p.add_script_tag(path=str(ROOT/'Client/scripts'/script))
            p.wait_for_function("sessionStorage.getItem('assistantServerContext')==='A'")
        p,q=pages
        p.evaluate("saveCartToStorage([{bookId:1,quantity:2}])")
        for label in ['account A to B','logout']:
            for page in pages: page.evaluate("sessionStorage.setItem('assistantHistory','private');sessionStorage.setItem('assistantPending','private')")
            p.evaluate("localStorage.setItem('accountChanged',crypto.randomUUID());window.dispatchEvent(new Event('accountidentitychanged'))")
            q.wait_for_function("!sessionStorage.getItem('assistantHistory') && !sessionStorage.getItem('assistantPending')")
            check(p.evaluate("!sessionStorage.getItem('assistantHistory') && loadCartFromStorage()[0].quantity===2"),'two tabs '+label+' clears private state and preserves cart')
        p.evaluate("window.ctrl=new AbortController();window.result=null;applyAssistantCartActions([{bookId:1,quantity:1}],'cancel',{signal:ctrl.signal}).then(r=>result=r).catch(e=>result=e.name);void 0")
        p.wait_for_function('typeof release === "function"');p.evaluate('ctrl.abort();release();release=null');p.wait_for_function('result!==null')
        check(p.evaluate("result==='AbortError' && loadCartFromStorage()[0].quantity===2 && !JSON.parse(localStorage.savedCart).assistantReceipts.cancel"),'cancel during catalog validation leaves cart and receipt unchanged')
        p.evaluate("result=null;applyAssistantCartActions([{bookId:1,quantity:1}],'cancel').then(r=>result=r);void 0");p.wait_for_function('typeof release === "function"');p.evaluate('release();release=null');p.wait_for_function('result!==null')
        p.evaluate("applyAssistantCartActions([{bookId:1,quantity:1}],'cancel')")
        check(p.evaluate('loadCartFromStorage()[0].quantity===3'),'retry commits once and receipt prevents duplicates')
        p.evaluate("window.valid=true;result=null;applyAssistantCartActions([{bookId:1,quantity:1}],'identity',{valid:()=>valid}).then(r=>result=r).catch(e=>result=e.name);void 0")
        p.wait_for_function('typeof release === "function"');p.evaluate('valid=false;release();release=null');p.wait_for_function('result!==null')
        check(p.evaluate("result==='AbortError' && loadCartFromStorage()[0].quantity===3 && !JSON.parse(localStorage.savedCart).assistantReceipts.identity"),'identity change during catalog validation prevents write')
        p.evaluate("ctrl=new AbortController();result=null;window.addEventListener('cartchanged',()=>ctrl.abort(),{once:true});applyAssistantCartActions([{bookId:1,quantity:1}],'committed',{signal:ctrl.signal}).then(r=>result=r).catch(e=>result=e.name);void 0")
        p.wait_for_function('typeof release === "function"');p.evaluate('release();release=null');p.wait_for_function('result!==null')
        check(p.evaluate("Array.isArray(result) && loadCartFromStorage()[0].quantity===4 && !!JSON.parse(localStorage.savedCart).assistantReceipts.committed"),'cancellation after commit reports actual result and preserves receipt')
        p.evaluate("saveAssistantHistory([{role:'user',content:'same account'}])")
        check(p.evaluate("loadAssistantHistory()[0].content==='same account'"),'same-context transcript restoration preserves conversation')
        for action,label in [("ctrl.abort()",'cancel before model completion'),("invalidateAssistant()",'identity change during model work'),("document.querySelector('#assistantClear').click()",'clear pending conversation')]:
            p.evaluate("getAssistantResponse=()=>new Promise(r=>window.modelRelease=r);sendAssistantMessage('test');void 0")
            p.wait_for_function('typeof window.modelRelease === "function"')
            p.evaluate("window.ctrl=assistantState.controller;"+action+";modelRelease({reply:'late',actions:[]});delete window.modelRelease")
            p.wait_for_timeout(50)
            check(p.evaluate("!assistantState.history.some(t=>t.content==='late')"),label+' suppresses late response')
        p.evaluate("sessionStorage.setItem('assistantServerContext','old');sessionStorage.setItem('assistantHistory','private')")
        p.evaluate('validateAssistantSession()')
        check(p.evaluate("!sessionStorage.getItem('assistantHistory')"),'server session invalidation clears private state')
        browser.close()
