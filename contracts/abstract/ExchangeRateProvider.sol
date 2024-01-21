pragma solidity ^0.4.19;
import "zeppelin-solidity/contracts/ownership/Ownable.sol";
import "../usingOraclize.sol";
import "./ExchangeRateReceiver.sol";
import "zeppelin-solidity/contracts/math/SafeMath.sol";

contract ExchangeRateProvider is Ownable, usingOraclize {

  using SafeMath for uint256;

  enum State { Stopped, Active }

  uint256 public updateInterval = 7200; //2 hours by default

  uint256 public currentPrice;

  string public url;

  mapping (bytes32 => bool) validIds;

  ExchangeRateReceiver public watcher;

  State public state = State.Stopped;

  uint256 constant MIN_ALLOWED_PRICE_DIFF = 85;

  uint256 constant MAX_ALLOWED_PRICE_DIFF = 115;

  event TooBigPriceDiff(uint256 oldValue, uint256 newValue);

  event InsufficientFunds();

  function notifyWatcher() internal;

  modifier inActiveState() {
    require(state == State.Active);
    _;
  }

  modifier inStoppedState() {
    require(state == State.Stopped);
    _;
  }

  function ExchangeRateProvider(string _url) public {
    url = _url;

    //update immediately first time to be sure everything is working - first oraclize request is free.
    update(0);
  }

  //send some funds along with the call to cover oraclize fees
  function startUpdate(uint256 startingPrice) public payable onlyOwner inStoppedState {
    state = State.Active;

    //we can set starting price manually, contract will notify watcher only in case of allowed diff
    //so owner can't set too small or to big price anyway
    currentPrice = startingPrice;
    update(updateInterval);
  }

  function stopUpdate() external onlyOwner inActiveState {
    state = State.Stopped;
  }

  function setWatcher(address newWatcher) external onlyOwner {
    require(newWatcher != 0x0);
    watcher = ExchangeRateReceiver(newWatcher);
  }

  function setUpdateInterval(uint256 newInterval) external onlyOwner {
    require(newInterval > 0);
    updateInterval = newInterval;
  }

  function setUrl(string newUrl) external onlyOwner {
    require(bytes(newUrl).length > 0);
    url = newUrl;
  }

  function __callback(bytes32 myid, string result, bytes proof) public {
    require(msg.sender == oraclize_cbAddress() && validIds[myid]);
    delete validIds[myid];

    uint256 newPrice = parseInt(result, 2);
    require(newPrice > 0);
    uint256 changeInPercents = newPrice.mul(100).div(currentPrice);

    if (changeInPercents >= MIN_ALLOWED_PRICE_DIFF && changeInPercents <= MAX_ALLOWED_PRICE_DIFF) {
      currentPrice = newPrice;

      if (state == State.Active) {
        notifyWatcher();
        update(updateInterval);
      }
    } else {
      state = State.Stopped;
      TooBigPriceDiff(currentPrice, newPrice);
    }
  }

  function update(uint256 delay) private {
    if (oraclize_getPrice("URL") > this.balance) {
      //stop if we don't have enough funds anymore
      state = State.Stopped;
      InsufficientFunds();
    } else {
      bytes32 queryId = oraclize_query(delay, "URL", url);
      validIds[queryId] = true;
    }
  }

  //we need to get back our funds if we don't need this oracle anymore
  function withdraw(address receiver) external onlyOwner inStoppedState {
    require(receiver != 0x0);
    receiver.transfer(this.balance);
  }
}
