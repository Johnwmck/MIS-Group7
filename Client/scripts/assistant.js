// Customer assistant chat: the floating "Ask us" widget on customer pages and
// the full-page chat plus FAQ list on help.html. All answers come from
// getAssistantResponse(), which posts the transcript to /api/assistant/chat;
// the server decides whether a local model or the scripted bot replies.
// Browser-side actions the server asks for (add to cart, open a page) run
// here. Depends on cart-state.js and book-utils.js. Does not use Bootstrap JS.

const ASSISTANT_HISTORY_KEY = 'assistantHistory';
const ASSISTANT_OPEN_KEY = 'assistantOpen';
const ASSISTANT_MAX_TURNS = 40;

const ASSISTANT_SUGGESTIONS = [
    'Recommend a fantasy book under $15',
    'What is your return policy?',
    'How long does shipping take?',
    'Check the status of my order'
];

// --- Server access (single drop-in point for a different backend later) ---

async function getAssistantResponse(messages) {
    const response = await fetch('/api/assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            messages: messages.map(function (turn) {
                // The model only sees text, so remind it which books (and ids)
                // its earlier replies showed; "add the first one" needs them.
                let content = turn.content;
                if (turn.role === 'assistant' && turn.books && turn.books.length) {
                    content += '\n[Books shown: ' + turn.books.map(function (book) {
                        return '#' + book.id + ' ' + book.title;
                    }).join('; ') + ']';
                }
                return { role: turn.role, content: content };
            })
        })
    });

    let result = null;
    try { result = await response.json(); } catch (error) { /* non-JSON error body */ }

    if (!response.ok) {
        throw new Error((result && result.error) || 'The assistant is unavailable right now (HTTP ' + response.status + ').');
    }
    if (!result || typeof result.reply !== 'string') {
        throw new Error('The assistant sent an unexpected response.');
    }
    return result;
}

async function getAssistantStatus() {
    try {
        const response = await fetch('/api/assistant/status', { cache: 'no-store' });
        return response.ok ? await response.json() : null;
    } catch (error) {
        return null;
    }
}

// --- Transcript storage (per browser tab) ---

function loadAssistantHistory() {
    try {
        const saved = JSON.parse(sessionStorage.getItem(ASSISTANT_HISTORY_KEY) || '[]');
        return Array.isArray(saved) ? saved : [];
    } catch (error) {
        return [];
    }
}

function saveAssistantHistory(turns) {
    if (turns.length > ASSISTANT_MAX_TURNS) turns = turns.slice(turns.length - ASSISTANT_MAX_TURNS);
    sessionStorage.setItem(ASSISTANT_HISTORY_KEY, JSON.stringify(turns));
    return turns;
}

// --- Rendering helpers ---

function escapeAssistantHtml(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// Models reply in light markdown; keep bold, bullets, and line breaks only.
function renderAssistantText(text) {
    const lines = escapeAssistantHtml(text).split(/\r?\n/);
    return lines.map(function (line) {
        let html = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        const bullet = html.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
        if (bullet) html = '<span class="assistant-bullet">' + bullet[1] + '</span>';
        return html;
    }).join('<br>');
}

function createAssistantBookCard(book) {
    const card = document.createElement('div');
    card.className = 'assistant-book';

    const price = typeof formatBookPriceHtml === 'function'
        ? formatBookPriceHtml(book)
        : currencyFormatter.format(book.salePrice != null ? book.salePrice : book.price);
    const unavailable = /out of stock|unavailable/i.test(book.availability || '');

    card.innerHTML = `
        <a class="assistant-book-cover" href="book.html?id=${book.id}" tabindex="-1" aria-hidden="true">
            <img src="${escapeAssistantHtml(book.image || 'images/cover-placeholder.svg')}" alt="" width="40" height="60" loading="lazy">
        </a>
        <div class="assistant-book-body">
            <a class="assistant-book-title" href="book.html?id=${book.id}">${escapeAssistantHtml(book.title)}</a>
            <div class="assistant-book-meta">${escapeAssistantHtml(book.author)}</div>
            <div class="assistant-book-meta">
                <span class="assistant-book-price">${price}</span>
                <span class="assistant-book-stock${unavailable ? ' text-danger' : ''}">${escapeAssistantHtml(book.availability || '')}</span>
            </div>
        </div>
        <button type="button" class="btn btn-sm btn-outline-primary assistant-book-add" ${unavailable ? 'disabled' : ''}
            aria-label="Add ${escapeAssistantHtml(book.title)} to cart">Add</button>
    `;

    card.querySelector('.assistant-book-add').addEventListener('click', async function (event) {
        const button = event.currentTarget;
        button.disabled = true;
        const error = await addAssistantBookToCart(book.id, 1);
        button.textContent = error ? 'Unavailable' : 'Added';
        if (error) assistantAnnounce(error);
        else setTimeout(function () { button.textContent = 'Add'; button.disabled = false; }, 1500);
    });

    return card;
}

function createAssistantActionButton(action) {
    const link = document.createElement('a');
    link.className = 'btn btn-sm btn-primary assistant-action';
    link.href = action.url;
    link.textContent = 'Open ' + (action.label || 'page');
    return link;
}

// --- Cart actions requested by the server ---

async function addAssistantBookToCart(bookId, quantity) {
    if (typeof setCartQuantity !== 'function') return 'The cart is not available on this page.';
    const existing = loadCartFromStorage().find(function (item) { return item.bookId === bookId; });
    const error = await setCartQuantity(bookId, (existing ? existing.quantity : 0) + quantity);
    if (!error) {
        const cartCount = document.getElementById('cartCount');
        if (cartCount) cartCount.textContent = getCartItemCount(loadCartFromStorage());
        window.dispatchEvent(new Event('cartchanged'));
    }
    return error;
}

// Runs each addToCart action once, then records the result on the turn so a
// page reload (which re-renders the saved transcript) never adds the book again.
async function performAssistantActions(turn) {
    for (const action of turn.actions || []) {
        if (action.type !== 'addToCart' || action.done) continue;
        action.done = true;
        const error = await addAssistantBookToCart(action.bookId, action.quantity || 1);
        action.result = error
            ? 'Could not add to cart: ' + error
            : 'Added ' + (action.quantity || 1) + ' × ' + action.title + ' to your cart.';
        if (!error && !(turn.actions || []).some(function (other) { return other.type === 'navigate'; })) {
            turn.actions.push({ type: 'navigate', url: 'cart.html', label: 'Cart' });
        }
    }
}

// --- Chat panel ---

let assistantState = null;

function assistantAnnounce(message) {
    if (!assistantState) return;
    assistantState.status.textContent = message;
}

function buildAssistantPanel(container, inline) {
    container.classList.add('assistant-panel');
    if (inline) container.classList.add('assistant-panel--inline');
    container.innerHTML = `
        <div class="assistant-header">
            <div>
                <div class="assistant-title">Team 7 Books Assistant</div>
                <div class="assistant-subtitle" id="assistantMode">Checking assistant…</div>
            </div>
            <div class="assistant-header-actions">
                <button type="button" class="assistant-icon-button" id="assistantClear" title="Clear conversation" aria-label="Clear conversation">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0z"/><path d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4zM2.5 3h11V2h-11z"/></svg>
                </button>
                ${inline ? '' : `<button type="button" class="assistant-icon-button" id="assistantClose" title="Close" aria-label="Close assistant">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8z"/></svg>
                </button>`}
            </div>
        </div>
        <div class="assistant-messages" id="assistantMessages" role="log" aria-live="polite" aria-label="Conversation"></div>
        <div class="assistant-suggestions" id="assistantSuggestions"></div>
        <form class="assistant-form" id="assistantForm" autocomplete="off">
            <label class="visually-hidden" for="assistantInput">Ask the assistant</label>
            <input type="text" class="form-control" id="assistantInput" maxlength="1000"
                placeholder="Ask about books, orders, or shipping…">
            <button type="submit" class="btn btn-primary" id="assistantSend" aria-label="Send">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M15.854.146a.5.5 0 0 1 .11.54l-5.819 14.547a.75.75 0 0 1-1.329.124l-3.178-4.995L.643 7.184a.75.75 0 0 1 .124-1.33L15.314.037a.5.5 0 0 1 .54.11ZM6.636 10.07l2.761 4.338L14.13 2.576zm6.787-8.201L1.591 6.602l4.339 2.76z"/></svg>
            </button>
        </form>
        <p class="assistant-status" id="assistantStatus" role="status"></p>
    `;

    assistantState = {
        panel: container,
        messages: container.querySelector('#assistantMessages'),
        suggestions: container.querySelector('#assistantSuggestions'),
        form: container.querySelector('#assistantForm'),
        input: container.querySelector('#assistantInput'),
        send: container.querySelector('#assistantSend'),
        status: container.querySelector('#assistantStatus'),
        mode: container.querySelector('#assistantMode'),
        history: loadAssistantHistory(),
        busy: false
    };

    assistantState.form.addEventListener('submit', function (event) {
        event.preventDefault();
        sendAssistantMessage(assistantState.input.value);
    });
    container.querySelector('#assistantClear').addEventListener('click', function () {
        assistantState.history = saveAssistantHistory([]);
        renderAssistantTranscript();
        assistantState.input.focus();
    });

    renderAssistantSuggestions();
    renderAssistantTranscript();
    showAssistantModeBadge();
}

function renderAssistantSuggestions() {
    const container = assistantState.suggestions;
    container.replaceChildren();
    ASSISTANT_SUGGESTIONS.forEach(function (text) {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'assistant-chip';
        chip.textContent = text;
        chip.addEventListener('click', function () { sendAssistantMessage(text); });
        container.appendChild(chip);
    });
}

async function showAssistantModeBadge() {
    const status = await getAssistantStatus();
    if (!assistantState) return;
    const badge = assistantState.mode;
    if (status && status.modelAvailable) {
        badge.textContent = 'Local AI • ' + status.model;
        badge.title = status.detail;
    } else {
        badge.textContent = 'Quick answers mode';
        badge.title = status ? status.detail : 'The assistant service could not be reached.';
    }
}

function createAssistantTurn(turn) {
    const row = document.createElement('div');
    row.className = 'assistant-turn assistant-turn--' + turn.role;

    const bubble = document.createElement('div');
    bubble.className = 'assistant-bubble';
    if (turn.role === 'user') {
        bubble.textContent = turn.content;
    } else {
        bubble.innerHTML = renderAssistantText(turn.content);
    }
    row.appendChild(bubble);

    if (turn.role === 'assistant') {
        if (turn.books && turn.books.length) {
            const list = document.createElement('div');
            list.className = 'assistant-books';
            turn.books.forEach(function (book) { list.appendChild(createAssistantBookCard(book)); });
            row.appendChild(list);
        }
        const notes = (turn.actions || []).filter(function (action) { return action.result; });
        if (notes.length) {
            const note = document.createElement('div');
            note.className = 'assistant-note';
            note.textContent = notes.map(function (action) { return action.result; }).join(' ');
            row.appendChild(note);
        }
        const links = (turn.actions || []).filter(function (action) { return action.type === 'navigate' && action.url; });
        if (links.length) {
            const bar = document.createElement('div');
            bar.className = 'assistant-actions';
            links.forEach(function (action) { bar.appendChild(createAssistantActionButton(action)); });
            row.appendChild(bar);
        }
        if (turn.mode === 'fallback') {
            const badge = document.createElement('div');
            badge.className = 'assistant-meta';
            badge.textContent = 'Quick answer';
            row.appendChild(badge);
        }
    }
    return row;
}

function renderAssistantTranscript() {
    const state = assistantState;
    state.messages.replaceChildren();

    if (state.history.length === 0) {
        const welcome = createAssistantTurn({
            role: 'assistant',
            content: 'Hi! I can recommend books, add them to your cart, check an order, or explain shipping and returns. What can I help with?'
        });
        state.messages.appendChild(welcome);
    }
    state.history.forEach(function (turn) { state.messages.appendChild(createAssistantTurn(turn)); });
    state.suggestions.hidden = state.history.length > 0;
    state.messages.scrollTop = state.messages.scrollHeight;
}

function showAssistantTyping() {
    const row = document.createElement('div');
    row.className = 'assistant-turn assistant-turn--assistant';
    row.innerHTML = '<div class="assistant-bubble assistant-typing" aria-label="Assistant is typing"><span></span><span></span><span></span></div>';
    assistantState.messages.appendChild(row);
    assistantState.messages.scrollTop = assistantState.messages.scrollHeight;
    return row;
}

async function sendAssistantMessage(text) {
    const state = assistantState;
    text = (text || '').trim();
    if (!text || state.busy) return;

    state.busy = true;
    state.send.disabled = true;
    state.input.value = '';
    state.status.textContent = '';

    state.history.push({ role: 'user', content: text });
    state.history = saveAssistantHistory(state.history);
    renderAssistantTranscript();
    const typing = showAssistantTyping();

    try {
        const result = await getAssistantResponse(state.history);
        const turn = {
            role: 'assistant',
            content: result.reply,
            mode: result.mode,
            books: result.books || [],
            actions: result.actions || []
        };
        await performAssistantActions(turn);
        state.history.push(turn);
        state.history = saveAssistantHistory(state.history);
    } catch (error) {
        state.history.push({
            role: 'assistant',
            content: 'Sorry, I could not answer that right now. ' + error.message +
                ' You can also email help@team7books.example.'
        });
        state.history = saveAssistantHistory(state.history);
    } finally {
        typing.remove();
        state.busy = false;
        state.send.disabled = false;
        renderAssistantTranscript();
        state.input.focus();
    }
}

// --- Floating widget (every customer page except help.html) ---

function mountAssistantWidget() {
    document.body.classList.add('has-assistant');

    const launcher = document.createElement('button');
    launcher.type = 'button';
    launcher.className = 'assistant-launcher';
    launcher.setAttribute('aria-expanded', 'false');
    launcher.setAttribute('aria-controls', 'assistantPanel');
    launcher.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M2.678 11.894a1 1 0 0 1 .287.801 11 11 0 0 1-.398 2c1.395-.323 2.247-.697 2.634-.893a1 1 0 0 1 .71-.074A8 8 0 0 0 8 14c3.996 0 7-2.807 7-6s-3.004-6-7-6-7 2.808-7 6c0 1.468.617 2.83 1.678 3.894m-.493 3.905a22 22 0 0 1-.713.129c-.2.032-.352-.176-.273-.362a10 10 0 0 0 .244-.637l.003-.01c.248-.72.45-1.548.524-2.319C.743 11.37 0 9.76 0 8c0-3.866 3.582-7 8-7s8 3.134 8 7-3.582 7-8 7a9 9 0 0 1-2.347-.306c-.52.263-1.639.742-3.468 1.105"/></svg>
        <span class="assistant-launcher-label">Ask us</span>
    `;

    const panel = document.createElement('section');
    panel.id = 'assistantPanel';
    panel.setAttribute('aria-label', 'Team 7 Books assistant');
    panel.hidden = true;

    document.body.append(launcher, panel);
    buildAssistantPanel(panel, false);

    function setOpen(open) {
        panel.hidden = !open;
        launcher.classList.toggle('is-open', open);
        launcher.setAttribute('aria-expanded', String(open));
        try { sessionStorage.setItem(ASSISTANT_OPEN_KEY, open ? '1' : '0'); } catch (error) { /* ignore */ }
        if (open) {
            assistantState.messages.scrollTop = assistantState.messages.scrollHeight;
            assistantState.input.focus();
        }
    }

    launcher.addEventListener('click', function () { setOpen(panel.hidden); });
    panel.querySelector('#assistantClose').addEventListener('click', function () {
        setOpen(false);
        launcher.focus();
    });
    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && !panel.hidden) setOpen(false);
    });

    let reopen = false;
    try { reopen = sessionStorage.getItem(ASSISTANT_OPEN_KEY) === '1'; } catch (error) { /* ignore */ }
    if (reopen) {
        panel.hidden = false;
        launcher.classList.add('is-open');
        launcher.setAttribute('aria-expanded', 'true');
        assistantState.messages.scrollTop = assistantState.messages.scrollHeight;
    }
}

// --- help.html: full-page chat plus the FAQ accordion ---

async function renderAssistantFaq(container) {
    try {
        const response = await fetch('/api/assistant/faq');
        const faqs = response.ok ? await response.json() : [];
        container.replaceChildren();
        faqs.forEach(function (faq, index) {
            const item = document.createElement('div');
            item.className = 'accordion-item';
            const id = 'faq-' + escapeAssistantHtml(faq.id);
            item.innerHTML = `
                <h3 class="accordion-header">
                    <button class="accordion-button${index === 0 ? '' : ' collapsed'}" type="button"
                        data-bs-toggle="collapse" data-bs-target="#${id}" aria-expanded="${index === 0}" aria-controls="${id}">
                        ${escapeAssistantHtml(faq.question)}
                    </button>
                </h3>
                <div id="${id}" class="accordion-collapse collapse${index === 0 ? ' show' : ''}" data-bs-parent="#faqAccordion">
                    <div class="accordion-body">${escapeAssistantHtml(faq.answer)}</div>
                </div>
            `;
            container.appendChild(item);
        });
    } catch (error) {
        container.innerHTML = '<p class="text-muted">The FAQ list could not be loaded. Ask the assistant instead.</p>';
    }
}

(function initializeAssistant() {
    const inlineHost = document.getElementById('assistantPage');
    if (inlineHost) {
        buildAssistantPanel(inlineHost, true);
        const faq = document.getElementById('faqAccordion');
        if (faq) renderAssistantFaq(faq);
        return;
    }
    mountAssistantWidget();
})();
