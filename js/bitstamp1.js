"use strict";

//  ---------------------------------------------------------------------------

const Exchange = require ('./base/Exchange')
const { ExchangeError, NotSupported, AuthenticationError } = require ('./base/errors')

//  ---------------------------------------------------------------------------

module.exports = class bitstamp1 extends Exchange {

    describe () {
        return this.deepExtend (super.describe (), {
            'id': 'bitstamp1',
            'name': 'Bitstamp v1',
            'countries': 'GB',
            'rateLimit': 1000,
            'version': 'v1',
            'hasCORS': true,
            'urls': {
                'logo': 'https://user-images.githubusercontent.com/1294454/27786377-8c8ab57e-5fe9-11e7-8ea4-2b05b6bcceec.jpg',
                'api': 'https://www.bitstamp.net/api',
                'www': 'https://www.bitstamp.net',
                'doc': 'https://www.bitstamp.net/api',
            },
            'api': {
                'public': {
                    'get': [
                        'ticker',
                        'ticker_hour',
                        'order_book',
                        'transactions',
                        'eur_usd',
                    ],
                },
                'private': {
                    'post': [
                        'balance',
                        'user_transactions',
                        'open_orders',
                        'order_status',
                        'cancel_order',
                        'cancel_all_orders',
                        'buy',
                        'sell',
                        'bitcoin_deposit_address',
                        'unconfirmed_btc',
                        'ripple_withdrawal',
                        'ripple_address',
                        'withdrawal_requests',
                        'bitcoin_withdrawal',
                    ],
                },
            },
            'markets': {
                'BTC/USD': { 'id': 'btcusd', 'symbol': 'BTC/USD', 'base': 'BTC', 'quote': 'USD' },
                'BTC/EUR': { 'id': 'btceur', 'symbol': 'BTC/EUR', 'base': 'BTC', 'quote': 'EUR' },
                'EUR/USD': { 'id': 'eurusd', 'symbol': 'EUR/USD', 'base': 'EUR', 'quote': 'USD' },
                'XRP/USD': { 'id': 'xrpusd', 'symbol': 'XRP/USD', 'base': 'XRP', 'quote': 'USD' },
                'XRP/EUR': { 'id': 'xrpeur', 'symbol': 'XRP/EUR', 'base': 'XRP', 'quote': 'EUR' },
                'XRP/BTC': { 'id': 'xrpbtc', 'symbol': 'XRP/BTC', 'base': 'XRP', 'quote': 'BTC' },
                'LTC/USD': { 'id': 'ltcusd', 'symbol': 'LTC/USD', 'base': 'LTC', 'quote': 'USD' },
                'LTC/EUR': { 'id': 'ltceur', 'symbol': 'LTC/EUR', 'base': 'LTC', 'quote': 'EUR' },
                'LTC/BTC': { 'id': 'ltcbtc', 'symbol': 'LTC/BTC', 'base': 'LTC', 'quote': 'BTC' },
                'ETH/USD': { 'id': 'ethusd', 'symbol': 'ETH/USD', 'base': 'ETH', 'quote': 'USD' },
                'ETH/EUR': { 'id': 'etheur', 'symbol': 'ETH/EUR', 'base': 'ETH', 'quote': 'EUR' },
                'ETH/BTC': { 'id': 'ethbtc', 'symbol': 'ETH/BTC', 'base': 'ETH', 'quote': 'BTC' },
            },
        });
    }

    async fetchOrderBook (symbol, params = {}) {
        if (symbol != 'BTC/USD')
            throw new ExchangeError (this.id + ' ' + this.version + " fetchOrderBook doesn't support " + symbol + ', use it for BTC/USD only');
        let orderbook = await this.publicGetOrderBook (params);
        let timestamp = parseInt (orderbook['timestamp']) * 1000;
        return this.parseOrderBook (orderbook, timestamp);
    }

    async fetchTicker (symbol, params = {}) {
        if (symbol != 'BTC/USD')
            throw new ExchangeError (this.id + ' ' + this.version + " fetchTicker doesn't support " + symbol + ', use it for BTC/USD only');
        let ticker = await this.publicGetTicker (params);
        let timestamp = parseInt (ticker['timestamp']) * 1000;
        let vwap = parseFloat (ticker['vwap']);
        let baseVolume = parseFloat (ticker['volume']);
        let quoteVolume = baseVolume * vwap;
        return {
            'symbol': symbol,
            'timestamp': timestamp,
            'datetime': this.iso8601 (timestamp),
            'high': parseFloat (ticker['high']),
            'low': parseFloat (ticker['low']),
            'bid': parseFloat (ticker['bid']),
            'ask': parseFloat (ticker['ask']),
            'vwap': vwap,
            'open': parseFloat (ticker['open']),
            'close': undefined,
            'first': undefined,
            'last': parseFloat (ticker['last']),
            'change': undefined,
            'percentage': undefined,
            'average': undefined,
            'baseVolume': baseVolume,
            'quoteVolume': quoteVolume,
            'info': ticker,
        };
    }

    parseTrade (trade, market = undefined) {
        let timestamp = undefined;
        if ('date' in trade) {
            timestamp = parseInt (trade['date']) * 1000;
        } else if ('datetime' in trade) {
            // timestamp = this.parse8601 (trade['datetime']);
            timestamp = parseInt (trade['datetime']) * 1000;
        }
        let side = (trade['type'] == 0) ? 'buy' : 'sell';
        let order = undefined;
        if ('order_id' in trade)
            order = trade['order_id'].toString ();
        if ('currency_pair' in trade) {
            if (trade['currency_pair'] in this.markets_by_id)
                market = this.markets_by_id[trade['currency_pair']];
        }
        return {
            'id': trade['tid'].toString (),
            'info': trade,
            'timestamp': timestamp,
            'datetime': this.iso8601 (timestamp),
            'symbol': market['symbol'],
            'order': order,
            'type': undefined,
            'side': side,
            'price': parseFloat (trade['price']),
            'amount': parseFloat (trade['amount']),
        };
    }

    async fetchTrades (symbol, since = undefined, limit = undefined, params = {}) {
        if (symbol != 'BTC/USD')
            throw new ExchangeError (this.id + ' ' + this.version + " fetchTrades doesn't support " + symbol + ', use it for BTC/USD only');
        let market = this.market (symbol);
        let response = await this.publicGetTransactions (this.extend ({
            'time': 'minute',
        }, params));
        return this.parseTrades (response, market);
    }

    async fetchBalance (params = {}) {
        let balance = await this.privatePostBalance ();
        let result = { 'info': balance };
        for (let c = 0; c < this.currencies.length; c++) {
            let currency = this.currencies[c];
            let lowercase = currency.toLowerCase ();
            let total = lowercase + '_balance';
            let free = lowercase + '_available';
            let used = lowercase + '_reserved';
            let account = this.account ();
            account['free'] = this.safeFloat (balance, free, 0.0);
            account['used'] = this.safeFloat (balance, used, 0.0);
            account['total'] = this.safeFloat (balance, total, 0.0);
            result[currency] = account;
        }
        return this.parseBalance (result);
    }

    async createOrder (symbol, type, side, amount, price = undefined, params = {}) {
        if (type != 'limit')
            throw new ExchangeError (this.id + ' ' + this.version + ' accepts limit orders only');
        if (symbol != 'BTC/USD')
            throw new ExchangeError (this.id + ' v1 supports BTC/USD orders only');
        let method = 'privatePost' + this.capitalize (side);
        let order = {
            'amount': amount,
            'price': price,
        };
        let response = await this[method] (this.extend (order, params));
        return {
            'info': response,
            'id': response['id'],
        };
    }

    async cancelOrder (id, symbol = undefined, params = {}) {
        return await this.privatePostCancelOrder ({ 'id': id });
    }

    parseOrderStatus (order) {
        if ((order['status'] == 'Queue') || (order['status'] == 'Open'))
            return 'open';
        if (order['status'] == 'Finished')
            return 'closed';
        return order['status'];
    }

    async fetchOrderStatus (id, symbol = undefined) {
        await this.loadMarkets ();
        let response = await this.privatePostOrderStatus ({ 'id': id });
        return this.parseOrderStatus (response);
    }

    async fetchMyTrades (symbol = undefined, since = undefined, limit = undefined, params = {}) {
        await this.loadMarkets ();
        let market = undefined;
        if (symbol)
            market = this.market (symbol);
        let pair = market ? market['id'] : 'all';
        let request = this.extend ({ 'id': pair }, params);
        let response = await this.privatePostOpenOrdersId (request);
        return this.parseTrades (response, market);
    }

    async fetchOrder (id, symbol = undefined, params = {}) {
        throw new NotSupported (this.id + ' fetchOrder is not implemented yet');
        await this.loadMarkets ();
    }

    sign (path, api = 'public', method = 'GET', params = {}, headers = undefined, body = undefined) {
        let url = this.urls['api'] + '/' + this.implodeParams (path, params);
        let query = this.omit (params, this.extractParams (path));
        if (api == 'public') {
            if (Object.keys (query).length)
                url += '?' + this.urlencode (query);
        } else {
            if (!this.uid)
                throw new AuthenticationError (this.id + ' requires `' + this.id + '.uid` property for authentication');
            let nonce = this.nonce ().toString ();
            let auth = nonce + this.uid + this.apiKey;
            let signature = this.encode (this.hmac (this.encode (auth), this.encode (this.secret)));
            query = this.extend ({
                'key': this.apiKey,
                'signature': signature.toUpperCase (),
                'nonce': nonce,
            }, query);
            body = this.urlencode (query);
            headers = {
                'Content-Type': 'application/x-www-form-urlencoded',
            };
        }
        return { 'url': url, 'method': method, 'body': body, 'headers': headers };
    }

    async request (path, api = 'public', method = 'GET', params = {}, headers = undefined, body = undefined) {
        let response = await this.fetch2 (path, api, method, params, headers, body);
        if ('status' in response)
            if (response['status'] == 'error')
                throw new ExchangeError (this.id + ' ' + this.json (response));
        return response;
    }
}