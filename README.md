# Verboro Website

This site now runs as a small Node.js app so the contact form can submit to `/api/contact` and send an email from the server.

## Run locally

```bash
node server.js
```

Open `http://localhost:3000`.

## Email setup

Set the private recipient and SMTP credentials in `.env`. The public website files do not contain the private recipient address.

Required values:

```env
CONTACT_TO=private-recipient@example.com
SMTP_HOST=smtp.example.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=mailer@example.com
SMTP_PASS=your-smtp-password
MAIL_FROM=mailer@example.com
```

For port `587`, set `SMTP_SECURE=false` so the server uses STARTTLS.
