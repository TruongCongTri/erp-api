const nodemailer = require('nodemailer');

async function test() {
  console.log('⏳ Attempting to connect to Google SMTP...');

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: 'chinhnamerp@gmail.com',
      // REPLACE THIS with your brand new 16-character App Password (NO SPACES)
      pass: 'mdbcwolxtxyllkhv',
    },
  });

  try {
    const info = await transporter.sendMail({
      from: 'chinhnamerp@gmail.com',
      to: 'tri.tcong@gmail.com', // Send an email to yourself
      subject: 'Test SMTP Connection',
      text: 'If you receive this, your App Password works perfectly!',
    });
    console.log('✅ SUCCESS! Email sent: ' + info.response);
  } catch (error) {
    console.error('❌ FAILED. Google rejected the credentials:');
    console.error(error.message);
  }
}

test();
