(function () {
    const form = document.getElementById('promotionForm');
    const message = document.getElementById('promotionMessage');
    const bookSelect = document.getElementById('promotionBooks');
    const list = document.getElementById('promotionList');
    let promotions = [], editing = null;
    const field = name => document.getElementById('promotion' + name);
    function status(text) { message.textContent = text; }
    async function request(method, path, body) {
        const r = await fetch('/api/' + path, { method, cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || 'Request failed (HTTP ' + r.status + ').');
        return data;
    }
    function localDate(value) { const d = new Date(value); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
    function edit(p) {
        editing = p; form.reset();
        field('Name').value = p?.name || '';
        field('Percent').value = p?.percentOff || 15;
        field('Start').value = localDate(p?.startsAt || Date.now());
        field('End').value = localDate(p?.endsAt || Date.now() + 30 * 86400000);
        field('Active').checked = p?.active ?? true;
        field('Member').checked = p?.membersOnly ?? false;
        field('Search').value = '';
        [...bookSelect.options].forEach(o => { o.selected = p?.bookIds.includes(Number(o.value)) || false; o.hidden = false; });
        field('Save').textContent = p ? 'Save promotion' : 'Create promotion';
        field('Name').focus();
    }
    async function load() {
        promotions = await request('GET', 'promotions/manage'); list.replaceChildren();
        for (const p of promotions) {
            const row = document.createElement('div'); row.className = 'card p-3 mb-2';
            const text = document.createElement('p'); text.textContent = p.name + ' · ' + p.percentOff + '% · ' + (p.membersOnly ? 'Members only' : 'Public') +
                ' · ' + p.bookIds.length + ' books · ' + (p.active ? 'Enabled' : 'Disabled') + ' · ' + new Date(p.startsAt).toLocaleString() + ' to ' + new Date(p.endsAt).toLocaleString();
            const buttons = document.createElement('div'); buttons.className = 'd-flex gap-2';
            const editButton = document.createElement('button'); editButton.type = 'button'; editButton.className = 'btn btn-sm btn-outline-primary'; editButton.textContent = 'Edit'; editButton.onclick = () => edit(p);
            const toggle = document.createElement('button'); toggle.type = 'button'; toggle.className = 'btn btn-sm btn-outline-secondary'; toggle.textContent = p.active ? 'Deactivate' : 'Activate';
            toggle.onclick = async () => { toggle.disabled = true; try { await request('PUT', 'promotions/' + p.id, { ...p, active: !p.active }); await load(); status('Promotion updated. Dates still determine when an enabled offer applies.'); } catch (e) { status(e.message); toggle.disabled = false; } };
            buttons.append(editButton, toggle); row.append(text, buttons); list.append(row);
        }
    }
    form.onsubmit = async event => {
        event.preventDefault(); field('Save').disabled = true;
        try {
            const p = { name: field('Name').value.trim(), percentOff: Number(field('Percent').value), startsAt: new Date(field('Start').value).toISOString(),
                endsAt: new Date(field('End').value).toISOString(), active: field('Active').checked, membersOnly: field('Member').checked,
                bookIds: [...bookSelect.selectedOptions].map(o => Number(o.value)), ...(editing ? { id: editing.id, revision: editing.revision } : {}) };
            await request(editing ? 'PUT' : 'POST', editing ? 'promotions/' + editing.id : 'promotions', p);
            await load(); edit(null); status('Promotion saved. Customer prices use the best currently eligible offer.');
        } catch (e) { status(e.message); }
        finally { field('Save').disabled = false; }
    };
    field('New').onclick = () => edit(null);
    field('Search').oninput = () => { const term = field('Search').value.toLowerCase(); [...bookSelect.options].forEach(o => { o.hidden = !o.text.toLowerCase().includes(term); }); };
    field('SelectVisible').onclick = () => { [...bookSelect.options].filter(o => !o.hidden).forEach(o => { o.selected = true; }); };
    field('ClearBooks').onclick = () => { [...bookSelect.options].forEach(o => { o.selected = false; }); };
    async function rewards() {
        const host = document.getElementById('internalRewards');
        try {
            const data = await request('GET', 'rewards'); host.replaceChildren();
            data.accounts.forEach(a => { const p = document.createElement('p'); p.textContent = 'Account #' + a.id + ' · ' + a.name + ' · ' + a.balance + ' points'; host.append(p); });
            if (!data.ledger.length) host.textContent = 'No rewards transactions yet.';
            data.ledger.forEach(e => { const p = document.createElement('p'); p.textContent = new Date(e.date).toLocaleString() + ' · Account #' + e.customerId + ' · Order #' + e.orderId + ' · ' + e.kind + ': ' + e.points; host.append(p); });
        } catch (e) { host.textContent = e.message; }
    }
    document.getElementById('refreshRewards').onclick = rewards;
    (async () => { try {
        const books = await loadBooksFromApi();
        books.sort((a, b) => a.title.localeCompare(b.title)).forEach(b => bookSelect.append(new Option(b.title + ' — ' + b.author + ' (#' + b.id + ')', b.id)));
        await load(); edit(null); await rewards();
    } catch (e) { status(e.message); } })();
})();
