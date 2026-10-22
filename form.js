// Public Web App deployment; server returns an explicit saved acknowledgement.
const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbxOUTr7WfT2qtlounRmG1E6It7eQaRPeVCXS8KN4MYDKck5IvlRhzwcPkdTbX-yg_BXUw/exec';

function addNewEmailField(input) {
    if (input.value.trim() && !input.nextElementSibling) {
        const next = document.createElement('input');
        next.type = 'email';
        next.name = 'invoice_emails[]';
        next.setAttribute('aria-label', 'כתובת מייל נוספת לשליחת חשבוניות');
        next.addEventListener('input', () => addNewEmailField(next));
        input.parentElement.appendChild(next);
    }
}

window.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('clientForm');
    const button = document.getElementById('submitBtn');
    const status = document.getElementById('statusMessage');
    let pending = null;
    const storageKey = 'improve-it-client-form-request';
    // Only the request ID and SHA-256 digest are stored, never contact details.
    try { pending = JSON.parse(sessionStorage.getItem(storageKey)); } catch (_) {}

    form.querySelectorAll('label').forEach((label, index) => {
        const input = label.nextElementSibling.matches('input')
            ? label.nextElementSibling : label.nextElementSibling.querySelector('input');
        input.id = 'client-field-' + index;
        label.htmlFor = input.id;
    });

    function show(message, type = '') {
        status.style.display = 'block';
        status.className = type;
        status.textContent = message;
    }

    form.addEventListener('submit', async event => {
        event.preventDefault();
        if (button.disabled || !form.reportValidity()) return;
        button.disabled = true;
        form.setAttribute('aria-busy', 'true');
        show('שומר את הנתונים בגיליון, אנא המתן...');
        try {
            const fields = new FormData(form);
            const data = Object.fromEntries([...fields.entries()].filter(([key]) => !key.endsWith('[]')));
            Object.keys(data).forEach(key => { data[key] = data[key].trim(); });
            data.invoice_emails = [...new Set(fields.getAll('invoice_emails[]').map(value => value.trim()).filter(Boolean))];
            const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(data)));
            const fingerprint = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
            if (!pending || pending.fingerprint !== fingerprint) {
                pending = {fingerprint, id: crypto.randomUUID()};
                try { sessionStorage.setItem(storageKey, JSON.stringify(pending)); } catch (_) {}
            }
            data.request_id = pending.id;
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 120000);
            let result;
            try {
                const response = await fetch(WEB_APP_URL, {
                    method: 'POST',
                    headers: {'Content-Type': 'text/plain;charset=utf-8'},
                    body: JSON.stringify(data),
                    redirect: 'follow',
                    credentials: 'omit',
                    signal: controller.signal
                });
                if (!response.ok) throw new Error('לא התקבל אישור שמירה מהשרת.');
                result = await response.json();
            } finally { clearTimeout(timeout); }
            if (result.ok !== true || result.saved !== true || result.request_id !== pending.id) {
                show(result.message || 'השרת לא אישר את שמירת הנתונים. הפרטים נשארו בטופס.', 'error');
                return;
            }
            show(result.warning || 'הטופס נשלח בהצלחה והנתונים נשמרו בגיליון!', result.warning ? 'warning' : 'success');
            form.reset();
            const emails = document.getElementById('invoiceEmailsContainer');
            [...emails.children].slice(1).forEach(input => input.remove());
            pending = null;
            try { sessionStorage.removeItem(storageKey); } catch (_) {}
        } catch (error) {
            show('לא התקבל אישור שמירה מהשרת. הפרטים נשארו בטופס. אפשר לנסות שוב עם אותם פרטים; מזהה השליחה מונע רישום כפול.', 'error');
            console.error('Form submission:', error);
        } finally {
            button.disabled = false;
            form.removeAttribute('aria-busy');
        }
    });
});
