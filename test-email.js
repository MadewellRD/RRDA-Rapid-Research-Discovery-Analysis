require('dotenv').config();

// Try dynamic import for nodemailer
async function testEmail() {
  console.log('📧 Testing M365 Email Configuration...\n');
  
  let nodemailer;
  try {
    nodemailer = require('nodemailer');
  } catch (err) {
    console.log('❌ Error loading nodemailer:', err.message);
    return;
  }

  console.log('✅ Nodemailer loaded');
  console.log('   Type:', typeof nodemailer);
  console.log('   Has createTransport:', typeof nodemailer.createTransport);
  
  if (typeof nodemailer.createTransport !== 'function') {
    console.log('❌ createTransport is not a function');
    console.log('   Available methods:', Object.keys(nodemailer));
    return;
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  });

  try {
    await transporter.verify();
    console.log('✅ SMTP connection verified');

    const info = await transporter.sendMail({
      from: `"${process.env.EMAIL_FROM_NAME || 'RDA Intelligence'}" <${process.env.SMTP_USER}>`,
      to: process.env.ALERT_EMAIL,
      subject: '🚀 RDA Email Integration Test',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px;">
          <h2 style="color: #6366f1;">🚀 RDA Email Integration Test</h2>
          <p><strong>RDA Intelligence Agent</strong> is ready to send email alerts.</p>
          <ul>
            <li>✅ M365 SMTP connection successful</li>
            <li>✅ Authenticated as: ${process.env.SMTP_USER}</li>
            <li>✅ Sending alerts to: ${process.env.ALERT_EMAIL}</li>
            <li>✅ Display name: ${process.env.EMAIL_FROM_NAME || 'RDA Intelligence'}</li>
          </ul>
          <hr style="border: 1px solid #e5e7eb; margin: 20px 0;">
          <p style="color: #6b7280; font-size: 12px;">
            Test sent from RDA setup | ${new Date().toLocaleString()}
          </p>
        </div>
      `,
    });

    console.log('✅ Test email sent successfully!');
    console.log('📬 Message ID:', info.messageId);
    console.log(`📧 Check ${process.env.ALERT_EMAIL}`);
    
  } catch (error) {
    console.error('❌ Email test failed:', error.message);
  }
}

testEmail();
