require('dotenv').config();
const https = require('https');

const webhookUrl = process.env.SLACK_WEBHOOK_URL;

if (!webhookUrl) {
  console.log('❌ SLACK_WEBHOOK_URL not set in .env');
  process.exit(1);
}

const message = {
  text: '🚀 RDA Slack Integration Test',
  blocks: [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: '🚀 RDA is now connected to Slack!'
      }
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*RDA Intelligence Agent* is ready to send alerts.\n\n✅ Connection successful!\n✅ Channel: #rda-alerts\n✅ Ready to monitor competitors'
      }
    },
    {
      type: 'divider'
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: 'Test sent from RDA setup | ' + new Date().toLocaleString()
        }
      ]
    }
  ]
};

const url = new URL(webhookUrl);
const options = {
  hostname: url.hostname,
  path: url.pathname + url.search,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  }
};

const req = https.request(options, (res) => {
  console.log(`Status: ${res.statusCode}`);
  
  if (res.statusCode === 200) {
    console.log('✅ Slack alert sent successfully!');
    console.log('📱 Check #rda-alerts channel in Slack');
  } else {
    console.log('❌ Failed to send Slack alert');
  }
});

req.on('error', (error) => {
  console.error('❌ Error:', error);
});

req.write(JSON.stringify(message));
req.end();
