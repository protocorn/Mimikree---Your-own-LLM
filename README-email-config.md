# Email Configuration for Mimikree

To enable the welcome email functionality for new users, you need to configure the email settings in your `.env` file.

## Required Environment Variables

Add the following lines to your `.env` file:

```
# Email Configuration
EMAIL_HOST=your-smtp-server.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your-email@example.com
EMAIL_PASS=your-email-password-or-app-password
EMAIL_FROM="Sahil Chordia <your-email@example.com>"
```

## Configuration Guide

1. **EMAIL_HOST**: Your SMTP server address (e.g., `smtp.gmail.com` for Gmail)
2. **EMAIL_PORT**: The port for your SMTP server
   - Common ports: 587 (TLS), 465 (SSL), 25 (unencrypted)
3. **EMAIL_SECURE**: Set to `true` for port 465, `false` for other ports
4. **EMAIL_USER**: Your email address
5. **EMAIL_PASS**: Your email password
   - For Gmail, you'll need to use an [App Password](https://support.google.com/accounts/answer/185833?hl=en)
6. **EMAIL_FROM**: The sender name and email that will appear in the "From" field

## Preventing Emails from Going to Spam (Without DKIM)

Since you don't have DKIM set up, here are alternative approaches to improve email deliverability:

1. **Use a reputable email service**:
   - Services like SendGrid, Mailgun, or Amazon SES offer free tiers and handle deliverability
   - They provide deliverability tools and handle email authentication for you
   - Example: [SendGrid's Free Plan](https://sendgrid.com/solutions/email-api/) (100 emails/day free)

2. **Ensure proper content and structure**:
   - Include both HTML and plain text versions of your email
   - Maintain a good text-to-image ratio (more text than images)
   - Avoid spam trigger words ('free', 'guaranteed', excessive exclamation marks)
   - Include a physical mailing address (even if generic)
   - Provide a clear unsubscribe mechanism

3. **Optimize sending patterns**:
   - Send from a consistent IP address
   - Maintain consistent sending volumes and schedules
   - Gradually increase volume when starting out (warm up your sender reputation)
   - Monitor bounce rates and spam complaints

4. **Implement basic SPF authentication**:
   - Even without DKIM, SPF authentication helps
   - Add a TXT record to your domain's DNS settings:
     ```
     TXT @ v=spf1 a mx include:_spf.google.com ~all
     ```
   - Replace with your provider's SPF record if not using Google

## Gmail Setup

If you're using Gmail:

1. Go to your Google Account settings
2. Navigate to Security
3. Enable 2-Step Verification if not already enabled
4. Create an App Password:
   - Select "Mail" as the app
   - Select "Other" as the device and name it "Mimikree"
   - Use the generated 16-character password as your `EMAIL_PASS`

## Testing Email Deliverability

After configuring the email settings:

1. Send test emails to multiple email providers (Gmail, Outlook, Yahoo, etc.)
2. Use a service like [mail-tester.com](https://www.mail-tester.com/) to check your spam score
3. Send emails to yourself and check if they land in your primary inbox
4. Ask a friend to check if your emails are delivered properly

## Using SendGrid Instead (Recommended Alternative to Direct SMTP)

If emails continue going to spam, consider switching to SendGrid:

1. Create a free SendGrid account
2. Verify your sender identity
3. Update your `.env` file:
   ```
   EMAIL_HOST=smtp.sendgrid.net
   EMAIL_PORT=587
   EMAIL_SECURE=false
   EMAIL_USER=apikey
   EMAIL_PASS=your-sendgrid-api-key
   EMAIL_FROM="Sahil Chordia <your-verified-email@example.com>"
   ```

## Troubleshooting

If welcome emails are still going to spam:

1. Check for misleading sender information (from address should match sending domain)
2. Ensure your email content isn't too sales-focused
3. Reduce the number of links and images
4. Remove any URL shorteners
5. Ask recipients to add your email to their contacts
6. Have recipients mark your emails as "not spam" if found in spam folder
7. Consider switching to a dedicated email service provider 