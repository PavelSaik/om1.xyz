pragma solidity ^0.4.19;

contract ExchangeRateReceiver {

  /// External agent that will can change exchange rate
  address public exchangeRateProvider;

  modifier onlyExchangeRateProvider() {
    require(msg.sender == exchangeRateProvider);
    _;
  }

  function setExchangeRate(uint256 ethUsdPrice) external;

  function setExchangeRateProvider(address provider) external;
}
