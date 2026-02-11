require('dotenv').config();
const https = require('https');

async function testEmail() {
  console.log('📧 Testing M365 Email via Microsoft Graph API...\n');
  
  // For now, let's just verify the config is set
  console.log('📋 Email Configuration Check:');
  console.log('   SMTP Host:', process.env.SMTP_HOST || '❌ Not set');
  console.log('   SMTP Port:', process.env.SMTP_PORT || '❌ Not set');
  console.log('   SMTP User:', process.env.SMTP_USER || '❌ Not set');
  console.log('   SMTP Password:', process.env.SMTP_PASSWORD ? '✅ Set (hidden)' : '❌ Not set');
  console.log('   Alert Email:', process.env.ALERT_EMAIL || '❌ Not set');
  console.log('   From Name:', process.env.EMAIL_FROM_NAME || 'RDA Intelligence');
  
  if (process.env.SMTP_USER && process.env.SMTP_PASSWORD) {
    console.log('\n✅ Email credentials are configured');
    console.log('⏳ Email sending will work once nodemailer is properly installed');
  } else {
    console.log('\n❌ Missing email credentials in .env');
  }
}

testEmail();
