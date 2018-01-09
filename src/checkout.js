import fs      from 'fs'
import path    from 'path'
import express from 'express'
import qrcode  from 'qrcode'
import moveDec from 'move-decimal-point'
import wrap    from './lib/promise-wrap'

const rpath = name => path.join(__dirname, name)

module.exports = (app, payListen) => {
  app.set('url', process.env.URL || '/')
  app.set('static_url', process.env.STATIC_URL || app.settings.url + 'static/')
  app.set('view engine', 'pug')
  app.set('views', rpath('../views'))

  app.locals.formatMsat = msat => moveDec(msat, -8) + ' mBTC'

  fs.existsSync(rpath('www')) // comes pre-built in dist/www
    ? app.use('/static', express.static(rpath('www')))

    : app.use('/static', require('stylus').middleware({ src: rpath('../www'), serve: true }))
         .use('/static', express.static(rpath('../www')))

  app.get('/checkout/:invoice', wrap(async (req, res) => {
    const opt = req.invoice.metadata && req.invoice.metadata.checkout || {}

    if (req.invoice.completed && opt.redirect_url)
      return res.redirect(opt.redirect_url)

    res.render('checkout', { ...req.invoice, expired: req.invoice_expired
                           , qr: await qrcode.toDataURL(`lightning:${req.invoice.payreq}`, { margin: 1 }) })
  }))

  // like /invoice/:invoice/wait, but user-accessible, doesn't reveal the full invoice fields,
  // and with a fixed timeout.
  app.get('/checkout/:invoice/wait', wrap(async (req, res) => {
    if (req.invoice_expired) return res.sendStatus(410)
    const completed = (req.invoice.completed || await payListen.register(req.invoice.id, 60000))
    res.sendStatus(completed ? 204 : 402)
  }))

  app.get('/checkout/:invoice/qr.png', wrap(async (req, res) => {
    qrcode.toFileStream(res.type('png'), `lightning:${req.invoice.payreq}`)
  }))
}