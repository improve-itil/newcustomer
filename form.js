// Public Web App deployment; server returns an explicit saved acknowledgement.
const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbxOUTr7WfT2qtlounRmG1E6It7eQaRPeVCXS8KN4MYDKck5IvlRhzwcPkdTbX-yg_BXUw/exec';

function addNewEmailField(input) {
    if (input.value.trim() && input === input.parentElement.querySelector('input:last-of-type')) {
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
    // Keep native constraints, but present accessible inline messages instead of browser bubbles.
    form.noValidate = true;
    let triedSubmission = false;
    let fieldSequence = 0;
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

    function validateInput(input) {
        if (!input.matches('input')) return true;
        const empty = !input.value.trim();
        let message = '';
        if (input.required && empty) message = 'יש למלא את השדה הזה כדי להמשיך.';
        else if (!empty && input.validity.typeMismatch) message = 'יש להזין כתובת מייל תקינה, למשל name@example.com.';
        else if (!input.validity.valid) message = 'יש לבדוק את הערך שהוזן בשדה.';
        if (!input.id) input.id = 'client-extra-field-' + (++fieldSequence);
        const errorId = input.id + '-error';
        let error = document.getElementById(errorId);
        if (!message) {
            input.removeAttribute('aria-invalid');
            if (error) error.remove();
            const describedBy = (input.getAttribute('aria-describedby') || '').split(' ').filter(id => id && id !== errorId);
            if (describedBy.length) input.setAttribute('aria-describedby', describedBy.join(' '));
            else input.removeAttribute('aria-describedby');
            return true;
        }
        input.setAttribute('aria-invalid', 'true');
        if (!error) {
            error = document.createElement('span');
            error.id = errorId;
            error.className = 'field-error';
            input.insertAdjacentElement('afterend', error);
        }
        error.textContent = message;
        const describedBy = new Set((input.getAttribute('aria-describedby') || '').split(' ').filter(Boolean));
        describedBy.add(errorId);
        input.setAttribute('aria-describedby', [...describedBy].join(' '));
        return false;
    }

    form.addEventListener('input', event => {
        if (event.target.matches('input[aria-invalid="true"]')) validateInput(event.target);
    });
    form.addEventListener('focusout', event => {
        if (event.target.matches('input') && (triedSubmission || event.target.value.trim())) validateInput(event.target);
    });

    function show(message, type = '') {
        status.style.display = 'flex';
        status.className = type;
        const titles = {success: 'הפרטים התקבלו, תודה!', error: 'לא הצלחנו להשלים את השליחה', warning: 'הפרטים נשמרו ונדרשת בדיקה'};
        const icon = document.createElement('span');
        icon.className = 'status-icon' + (type ? '' : ' is-loading');
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = {success: '✓', error: '!', warning: '!'}[type] || '';
        const content = document.createElement('div');
        const title = document.createElement('strong');
        title.className = 'status-title';
        title.textContent = titles[type] || 'רק רגע, שומרים את הפרטים';
        const description = document.createElement('p');
        description.className = 'status-description';
        description.textContent = message;
        content.append(title, description);
        status.replaceChildren(icon, content);
    }

    form.addEventListener('submit', async event => {
        event.preventDefault();
        if (button.disabled) return;
        triedSubmission = true;
        const invalidInputs = [...form.querySelectorAll('input')].filter(input => !validateInput(input));
        if (invalidInputs.length) {
            invalidInputs[0].focus();
            // Field messages provide the actionable detail next to each input.
            status.style.display = 'none';
            return;
        }
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
            triedSubmission = false;
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
