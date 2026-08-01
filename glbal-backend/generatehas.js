const bcrypt = require('bcryptjs');

const password = 'Global100'; // Change to your new password

bcrypt.hash(password, 10).then(hash => {
  console.log('\nBcrypt Hash:\n');
  console.log(hash);
}).catch(console.error);