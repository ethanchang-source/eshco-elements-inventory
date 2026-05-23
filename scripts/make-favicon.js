const sharp = require('sharp')
sharp('public/logo.png')
  .flatten({ background: { r: 15, g: 23, b: 42 } })
  .negate({ alpha: false })
  .resize(64, 64)
  .toFile('src/app/favicon.ico', (err) => {
    if (err) console.error(err)
    else console.log('favicon created!')
  })
