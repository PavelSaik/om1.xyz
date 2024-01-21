pragma solidity ^0.4.19;

import "./UpgradeableToken.sol";
import "zeppelin-solidity/contracts/token/ERC20/MintableToken.sol";

/**
 * @title Omine1Token
 *
 * @dev Mintable Ownable ERC20 token
 */
contract Omine1Token is MintableToken, UpgradeableToken {

  string public name = "Omine.1 Token";
  string public symbol = "OM1";
  uint8 public decimals = 4;

  /** A crowdsale contract can release us to the wild if ICO success. If false we are are in transfer lock up period.*/
  bool public released = false;

  address public frozenWallet = address(0);
  uint256 public freezingDate = 0;

  function Omine1Token(address _owner, address _frozenWallet) UpgradeableToken(_owner) public {
    frozenWallet = _frozenWallet;
  }

  /**
   * Limit token transfer until the crowdsale is over.
   */
  modifier canTransfer(address _sender) {
    require(released);
    require(now > freezingDate || _sender != frozenWallet);
    _;
  }

  /**
   * One way function to release the tokens to the wild.
   * Can be called only from the release agent that is the final ICO contract.
   * It is only called if the crowdsale has been success (first milestone reached).
   *
   */
  function releaseTokenTransfer() public onlyOwner {
    released = true;
  }

  function transfer(address _to, uint _value) public canTransfer(msg.sender) returns (bool success) {
    // Call StandardToken.transfer()
    return super.transfer(_to, _value);
  }

  function transferFrom(address _from, address _to, uint _value) public canTransfer(_from) returns (bool success) {
    // Call StandardToken.transferForm()
    return super.transferFrom(_from, _to, _value);
  }

  function setFreezingDate(uint256 _freezingDate) public onlyOwner {
    require(_freezingDate > now);
    freezingDate = _freezingDate;
  }

  // Can upgrade to OM2 only when project reaches 2 year phase
  function canUpgrade() public view returns(bool) {
    return released && now > freezingDate;
  }
}
