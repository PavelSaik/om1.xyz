pragma solidity ^0.4.19;
import "./abstract/ExchangeRateProvider.sol";

contract EthPriceProvider is ExchangeRateProvider {
  function EthPriceProvider() ExchangeRateProvider("json(https://api.kraken.com/0/public/Ticker?pair=ETHUSD).result.XETHZUSD.c.0") public {
    OAR = OraclizeAddrResolverI(0x6f485C8BF6fc43eA212E93BBF8ce046C7f1cb475);
  }

  function notifyWatcher() internal {
    watcher.setExchangeRate(currentPrice);
  }
}
