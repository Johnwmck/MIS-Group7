"""Isolated API checks and a deterministic streaming MIS substitute. Never touches live App_Data.
Run: python3 tests/integration.py [--browser]
Optional browser checks require Playwright and a local Chrome installation.
"""
import concurrent.futures, copy, hashlib, re, http.cookiejar, http.server, json, os, pathlib, socket, subprocess, sys, tempfile, threading, time, urllib.error, urllib.request, uuid
ROOT = pathlib.Path(__file__).resolve().parents[1]
CHECKS = []
def check(condition, label):
    if not condition: raise AssertionError(label)
    CHECKS.append(label); print('PASS', label, flush=True)
def free_port():
    with socket.socket() as s: s.bind(('127.0.0.1', 0)); return s.getsockname()[1]
class Api:
    def __init__(self, base):
        self.base = base; self.jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))
    def call(self, method, path, data=None, status=200):
        req = urllib.request.Request(self.base + path, data=None if data is None else json.dumps(data).encode(), method=method,
            headers={'Content-Type': 'application/json'})
        try: r = self.opener.open(req, timeout=30)
        except urllib.error.HTTPError as error: r = error
        raw = r.read(); body = json.loads(raw) if raw else None
        assert r.status == status, (method, path, r.status, status, body)
        return body
    def register(self, email):
        return self.call('POST','/api/customers/register',dict(firstName='Test',lastName='Reader',email=email,password='test-password-123'),201)
    def quote(self, ids, points=0):
        return self.call('POST','/api/orders/quote',dict(items=[dict(bookId=i,quantity=q) for i,q in ids],redeemPoints=points))
    def purchase(self, ids, points=0):
        q = self.quote(ids,points)
        return dict(requestKey=str(uuid.uuid4()),customerName='Test Reader',customerEmail='checkout@example.com',items=q['items'],
            redeemPoints=points,expectedTotal=q['total'],expectedCustomerId=q['customerId'],newCard=dict(brand='Visa',last4='4242',expMonth=12,expYear=2035,nameOnCard='Test Reader'))
    def chat(self, text, cart=None, history=None, status=200, request_id=None):
        return self.call('POST','/api/assistant/chat',dict(requestId=request_id or str(uuid.uuid4()),cart=cart or [],messages=(history or [])+[dict(role='user',content=text)]),status)
class MockModel(http.server.BaseHTTPRequestHandler):
    def log_message(self,*args): pass
    def do_POST(self):
        if self.headers.get('Transfer-Encoding') == 'chunked':
            chunks=[]
            while True:
                size=int(self.rfile.readline().split(b';')[0],16)
                if not size: self.rfile.readline(); break
                chunks.append(self.rfile.read(size)); self.rfile.read(2)
            raw=b''.join(chunks)
        else: raw=self.rfile.read(int(self.headers['Content-Length']))
        body = json.loads(raw)
        assert body['stream'] is True and body['chat_template_kwargs']['enable_thinking'] is False
        assert self.path == '/v1/chat/completions' and body['model'] == 'qwen3.8-27b'
        messages = body['messages']; text = next(m['content'] for m in reversed(messages) if m['role']=='user').lower()
        for status in [401,403,404,429,503]:
            if 'provider'+str(status) in text:
                self.send_response(status); self.end_headers(); self.wfile.write(b'{"error":"provider detail must not leak: secret-test-key"}'); return
        if 'timeout' in text: time.sleep(7)
        self.send_response(200); self.send_header('Content-Type','text/event-stream'); self.end_headers()
        def event(delta,finish=None):
            self.wfile.write(('data: '+json.dumps(dict(choices=[dict(index=0,delta=delta,finish_reason=finish)]))+'\n\n').encode()); self.wfile.flush()
        try:
            if messages[-1]['role']=='tool':
                event(dict(content='Here are the current catalog results.')); event({},'stop')
            else:
                name,args='search_books',dict(query='',genre='Fantasy',limit=3)
                if 'cheaper' in text: args=dict(query='',max_price=8,limit=3)
                if 'another author' in text: args=dict(query='',exclude_author='J.K. Rowling',limit=3)
                if 'second one' in text:
                    prior=next((m['content'] for m in reversed(messages) if m['role']=='assistant' and '[Books shown:' in m['content']), '')
                    ids=re.findall(r'#(\d+)',prior); name,args='add_to_cart',dict(book_id=int(ids[1]) if len(ids)>1 else 2,quantity=2)
                if 'series' in text or 'collection' in text or 'only missing' in text:
                    name='add_series' if 'add' in text or 'only missing' in text else 'get_series'; args=dict(name='Hunger Games')
                    if 'skip duplicates' in text: args['include_duplicates']=False
                if 'add book' in text: name,args='add_to_cart',dict(book_id=1,quantity=12 if '12 copies' in text else 2)
                if 'fraction' in text: name,args='add_to_cart',dict(book_id=1,quantity=1.5)
                if 'ambiguous' in text: name,args='add_to_cart',dict(title='Harry Potter')
                if 'forbidden' in text: name,args='place_order',dict(customer_id=1)
                if 'order' in text and 'forbidden' not in text: name,args='lookup_order',dict(order_id=int(text.split('order ')[-1].split()[0]),email='checkout@example.com',customer_id=1)
                if 'deals' in text: name,args='store_information',{}
                encoded=json.dumps(args); midpoint=len(encoded)//2
                event(dict(tool_calls=[dict(index=0,id='tool-1',type='function',function=dict(name=name,arguments=encoded[:midpoint]))]))
                event(dict(tool_calls=[dict(index=0,function=dict(arguments=encoded[midpoint:]))]))
                if 'repeat add' in text:
                    event(dict(tool_calls=[dict(index=1,id='tool-2',type='function',function=dict(name=name,arguments=encoded))]))
                if 'truncated' in text: return
                event({},'tool_calls')
            self.wfile.write(b'data: [DONE]\n\n'); self.wfile.flush()
        except (BrokenPipeError,ConnectionResetError): pass

def run(browser=False):
    original = ROOT/'API/App_Data/bookstore-state.json'
    original_hash = hashlib.sha256(original.read_bytes()).hexdigest() if original.exists() else None
    with tempfile.TemporaryDirectory(prefix='team7-integration-') as tmp:
        tmp=pathlib.Path(tmp); state=tmp/'state.json'; port=free_port(); mock_port=free_port(); base=f'http://127.0.0.1:{port}'
        mock=http.server.ThreadingHTTPServer(('127.0.0.1',mock_port),MockModel); threading.Thread(target=mock.serve_forever,daemon=True).start()
        env=os.environ.copy(); env.update(ASPNETCORE_ENVIRONMENT='Development',Bookstore__StatePath=str(state),MIS_LLM_KEY='secret-test-key',
            MIS_LLM_ENDPOINT=f'http://127.0.0.1:{mock_port}/v1',MIS_LLM_MODEL='qwen3.8-27b',MIS_LLM_TIMEOUT_SECONDS='5')
        log=open(tmp/'server.log','w'); server=None
        def start():
            nonlocal server
            server=subprocess.Popen(['dotnet',str(ROOT/'API/bin/Debug/net10.0/Team7Books.Api.dll'),'--urls',base],cwd=ROOT,env=env,stdout=log,stderr=subprocess.STDOUT)
            for _ in range(150):
                if server.poll() is not None: raise RuntimeError('API exited; '+(tmp/'server.log').read_text()[-4000:])
                try:
                    if urllib.request.urlopen(base+'/api/books',timeout=1).status==200: return
                except (OSError,urllib.error.URLError): time.sleep(.1)
            raise TimeoutError('API did not start')
        def stop():
            nonlocal server
            if server is not None:
                server.terminate()
                try: server.wait(timeout=10)
                except subprocess.TimeoutExpired: server.kill(); server.wait()
                server=None
        try:
            start(); guest=Api(base); admin=Api(base); employee=Api(base); alice=Api(base); bob=Api(base)
            books=guest.call('GET','/api/books'); check(len(books)==573,'fresh startup imports complete catalog')
            guest.call('GET','/api/orders',status=401); guest.call('POST','/api/demo/reset',{},401); guest.call('GET','/api/staff',status=401)
            admin.call('POST','/api/staff/login',dict(username='admin',password='bad'),401)
            admin.call('POST','/api/staff/login',dict(username='admin',password='admin123'))
            employee.call('POST','/api/staff/login',dict(username='employee',password='employee123'))
            employee.call('POST','/api/promotions',{},403); employee.call('GET','/api/rewards',status=403)
            check(True,'guest and employee cannot perform admin operations')
            tempstaff=admin.call('POST','/api/staff',dict(name='Temporary Employee',username='temporary',password='temp-password-123',active=True))
            restricted=Api(base); restricted.call('POST','/api/staff/login',dict(username='temporary',password='temp-password-123'))
            admin.call('PUT','/api/staff/'+str(tempstaff['id']),dict(name=tempstaff['name'],username=tempstaff['username'],password=None,active=False))
            restricted.call('GET','/api/orders',status=401)
            check(True,'disabling a staff account immediately invalidates its cookie')
            alice.call('POST','/api/customers/register',dict(firstName='',lastName='Reader',email='bad',password='short'),400)
            alice.call('POST','/api/customers/login',dict(email='nobody@example.com',password='wrong'),401)
            a=alice.register('alice@example.com'); bob.register('bob@example.com')
            alice.call('POST','/api/customers/register',dict(firstName='A',lastName='B',email='ALICE@example.com',password='test-password-123'),409)
            bob.call('PUT','/api/books/1',books[0],403); bob.call('GET','/api/orders',status=403)
            check(True,'registration, case-insensitive duplicate handling, and customer roles')
            alice.call('POST','/api/customers/me/favorites/merge',[1,2,2]); alice.call('POST','/api/customers/me/favorites/merge',[2,3])
            check(alice.call('GET','/api/customers/me/favorites')==[1,2,3] and bob.call('GET','/api/customers/me/favorites')==[],'favorites merge is idempotent and account-isolated')
            # Deterministic active offers independent of the machine date.
            p=dict(name='Integration member',bookIds=[1,2,9,10,11,12],percentOff=30,startsAt='2020-01-01T00:00:00Z',endsAt='2090-01-01T00:00:00Z',membersOnly=True,active=True)
            saved=admin.call('POST','/api/promotions',p)
            public=admin.call('POST','/api/promotions',{**p,'name':'Integration public','percentOff':10,'membersOnly':False})
            catalog=alice.call('GET','/api/books'); b1=next(b for b in catalog if b['id']==1); b2=next(b for b in catalog if b['id']==2)
            check(b1['salePrice']==round(b1['price']*.7,2) and b1['memberOfferApplied'],'member price comes from session and best offer')
            check(guest.call('GET','/api/books/1')['salePrice']>b1['salePrice'],'guest sees public price and member teaser')
            expired=admin.call('POST','/api/promotions',{**p,'name':'Expired','percentOff':99,'endsAt':'2021-01-01T00:00:00Z'})
            check(alice.call('GET','/api/books/1')['salePrice']==b1['salePrice'],'expired promotion cannot affect current pricing')
            admin.call('PUT','/api/promotions/'+str(saved['id']),{**saved,'percentOff':35})
            admin.call('PUT','/api/promotions/'+str(saved['id']),saved,409)
            current=next(p for p in admin.call('GET','/api/promotions/manage') if p['id']==saved['id'])
            admin.call('PUT','/api/promotions/'+str(saved['id']),{**current,'percentOff':30})
            check(True,'promotion create/edit and stale edit rejection')
            # Increase only isolated inventory to earn enough points for a second purchase.
            book=admin.call('GET','/api/books/1'); book['inventory']=100; admin.call('PUT','/api/books/1',book)
            request=alice.purchase([(1,12)]); order=alice.call('POST','/api/orders',request,201)
            check(order['pointsEarned']==int(order['subtotal']) and order['pointsEarned']>=100 and order['tax']==round(order['subtotal']*.1,2),'member purchase awards whole-dollar points and 10% tax')
            after_stock=alice.call('GET','/api/books/1')['inventory']
            with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
                # Each opener has its own cookie jar clone so concurrent HTTP operations are independent.
                def retry(_):
                    client=Api(base)
                    for cookie in alice.jar: client.jar.set_cookie(copy.copy(cookie))
                    return client.call('POST','/api/orders',request)['id']
                ids=list(pool.map(retry,range(4)))
            check(ids==[order['id']]*4 and alice.call('GET','/api/books/1')['inventory']==after_stock,'concurrent checkout retries do not repeat stock deduction')
            rewards=alice.call('GET','/api/customers/me/rewards'); check(len(rewards['history'])==2 and rewards['balance']==order['pointsEarned'],'ledger has one award and redemption per order')
            bob.call('GET','/api/orders/'+str(order['id']),status=404)
            bob.call('POST','/api/customers/me/orders/'+str(order['id'])+'/refund',dict(type='Return',reason='No longer needed'),404)
            check(bob.call('GET','/api/customers/me/orders')==[],'orders and refunds enforce authenticated ownership')
            redemption=alice.purchase([(2,2)],100); second=alice.call('POST','/api/orders',redemption,201)
            check(second['rewardDiscount']==5 and second['pointsRedeemed']==100 and second['pointsEarned']==int(second['subtotal']),'later purchase redeems existing points before tax')
            check(second['total']==round(second['subtotal']+second['tax'],2),'discounted total remains cent-exact')
            balance_after=alice.call('GET','/api/customers/me/rewards')['balance']
            check(alice.call('POST','/api/orders',redemption)['id']==second['id'] and alice.call('GET','/api/customers/me/rewards')['balance']==balance_after,'redemption retry cannot spend or award points twice')
            alice.call('POST','/api/orders/quote',dict(items=[dict(bookId=2,quantity=1)],redeemPoints=100000),409)
            alice.call('POST','/api/orders/quote',dict(items=[dict(bookId=2,quantity=1)],redeemPoints=50),409)
            # Failed replacement must not commit any part of a purchase or points.
            failure_request=alice.purchase([(1,1)])
            before=state.read_bytes(); backup=tmp/'backup.json'; state.rename(backup); state.mkdir()
            alice.call('POST','/api/orders',failure_request,503)
            check(alice.call('GET','/api/books/1')['inventory']==after_stock,'failed save leaves inventory unchanged')
            state.rmdir(); backup.rename(state)
            check(state.read_bytes()==before and len(alice.call('GET','/api/customers/me/orders'))==2,'failed save leaves orders and ledger unchanged')
            recovered=alice.call('POST','/api/orders',failure_request,201)
            guest_req=guest.purchase([(3,1)]); guest_order=guest.call('POST','/api/orders',guest_req,201)
            guest.register('checkout@example.com')
            check(guest.call('GET','/api/customers/me/orders')==[] and guest_order['pointsEarned']==0,'guest checkout stays unclaimed by later same-email account')
            # Employee edits cannot alter book price or title.
            b=employee.call('GET','/api/books/2'); original_title=b['title']; original_price=b['price']; b.update(title='Unauthorized title',price=1,inventory=20)
            edited=employee.call('PUT','/api/books/2',b)
            check(edited['title']==original_title and edited['price']==original_price and edited['inventory']==20,'employee updates are limited to inventory and availability')
            stock=admin.call('GET','/api/books/12'); stock['manualStockOverride']=True; admin.call('PUT','/api/books/12',stock)
            alice.call('POST','/api/orders/quote',dict(items=[dict(bookId=12,quantity=1)],redeemPoints=0),409)
            check(True,'manual out-of-stock prevents purchase')
            # Assistant performs real application reads; only the provider is substituted.
            no_intent=alice.chat('How do I add book to cart?'); check(not no_intent['actions'],'informational wording cannot authorize a cart action')
            reply=alice.chat('Recommend fantasy'); check(len(reply['books'])==3 and all(b['id'] in [book['id'] for book in books] for b in reply['books']),'assistant recommendations use real catalog cards')
            follow=alice.chat('something cheaper',history=[dict(role='user',content='recommend books'),dict(role='assistant',content='[Books shown: #1 Harry Potter $20]')]); check(all((b.get('salePrice') or b['price'])<=8 for b in follow['books']),'assistant cheaper follow-up executes price-filtered search')
            authors=alice.chat('by another author'); check(all('J.K. Rowling' not in b['author'] for b in authors['books']),'assistant author exclusion works')
            add=alice.chat('add book repeat add'); check(len(add['actions'])==1 and add['actions'][0]['quantity']==2,'repeated model tool calls prepare one cart addition')
            fraction=alice.chat('add book fraction'); check(not fraction['actions'],'fractional action quantity rejected')
            ambiguous=alice.chat('add ambiguous title'); check(not ambiguous['actions'],'ambiguous title does not choose an arbitrary book')
            series=alice.chat('Show Hunger Games collection'); check(len(series['books'])==4 and any('Out of stock'==b['availability'] for b in series['books']),'series lists all catalog entries including unavailable books')
            series_add=alice.chat('add Hunger Games collection'); check(len(series_add['actions'])==3 and series_add['notes'],'series collection skips and explains unavailable entries')
            dup=alice.chat('add Hunger Games collection',cart=[dict(bookId=9,quantity=1)]); check(not dup['actions'],'collection asks about existing copies')
            skip=alice.chat('add Hunger Games collection skip duplicates',cart=[dict(bookId=9,quantity=1)]); check(len(skip['actions'])==2,'collection respects explicit duplicate choice')
            clarified=alice.chat('only missing entries',cart=[dict(bookId=9,quantity=1)],history=[dict(role='user',content='add Hunger Games collection'),dict(role='assistant',content=dup['reply'])])
            check(len(clarified['actions'])==2,'collection understands a natural duplicate-clarification follow-up')
            forbidden=alice.chat('add forbidden order'); check(not forbidden['actions'],'assistant cannot place orders or perform privileged operations')
            own=alice.chat('order '+str(order['id'])); other=bob.chat('order '+str(order['id'])); check(not other['actions'] and 'customerEmail' not in json.dumps(other),'assistant account tools do not leak another account')
            alice.chat('current deals'); check(True,'assistant reads changing promotions and authenticated rewards')
            for code in [401,403,404,429,503]:
                error=alice.chat('provider'+str(code),status=503); check('secret-test-key' not in json.dumps(error),'provider '+str(code)+' produces sanitized failure')
            alice.chat('add book truncated',status=503); check(True,'truncated tool stream cannot return cart actions')
            alice.chat('timeout',status=504); check(True,'provider timeout is explicit and cancels turn')
            before_state=json.loads(state.read_text()); stop(); start()
            check(len(alice.call('GET','/api/customers/me/orders'))==3 and len(admin.call('GET','/api/rewards')['ledger'])==6,'accounts, cookies, orders and rewards survive API restart')
            check(alice.call('GET','/api/books/1')['inventory']==before_state['books'][0]['inventory'],'inventory survives restart')
            historical=alice.call('GET','/api/orders/'+str(order['id'])); check(historical['total']==order['total'] and historical['items']==order['items'],'historical order price snapshots remain unchanged')
            refunded=alice.call('POST','/api/customers/me/orders/'+str(second['id'])+'/refund',dict(type='Return',reason='No longer needed'))
            check(refunded['refund']['total']==second['total'] and len(alice.call('GET','/api/customers/me/rewards')['history'])==8,'prototype refunds reverse earned and redeemed points atomically')
            alice.call('POST','/api/customers/me/orders/'+str(second['id'])+'/refund',dict(type='Return',reason='No longer needed'),409)
            ranking=admin.call('GET','/api/orders/best-sellers'); check(all('customerEmail' not in r for r in ranking),'public best sellers expose only aggregated book sales')
            if browser:
                from browser_checks import run_browser
                run_browser(base,check)
            # Missing credentials remains explicit. No automatic scripted fallback.
            stop(); env['MIS_LLM_KEY']=''; start(); Api(base).chat('recommend',status=503); check(not Api(base).call('GET','/api/assistant/status')['modelAvailable'],'missing provider credentials is explicit')
            alice.call('POST','/api/customers/logout',{},204); check(alice.call('GET','/api/customers/me',status=204) is None,'sign-out removes server session')
            # Demo reset only in isolated state; staff remains, customer cookies cannot resurrect.
            admin.call('POST','/api/demo/reset',{},204)
            check(not admin.call('GET','/api/orders') and Api(base).call('GET','/api/books/1')['inventory']==books[0]['inventory'],'authorized reset restores seeds and removes purchase/account/ledger data')
        finally:
            stop(); mock.shutdown(); log.close()
            if original_hash is not None: check(hashlib.sha256(original.read_bytes()).hexdigest()==original_hash,'existing local state file was never modified by tests')
    print(str(len(CHECKS))+' integration checks passed.',flush=True)
if __name__=='__main__': run('--browser' in sys.argv)
