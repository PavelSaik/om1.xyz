/**
 * This smart contract code is Copyright 2017 TokenMarket Ltd. For more information see https://tokenmarket.net
 *
 * Licensed under the Apache License, version 2.0: https://github.com/TokenMarketNet/ico/blob/master/LICENSE.txt
 */

pragma solidity ^0.4.19;

import "zeppelin-solidity/contracts/token/ERC20/StandardToken.sol";
import "./UpgradeAgent.sol";

/**
 * A token upgrade mechanism where users can opt-in amount of tokens to the next smart contract revision.
 *
 * First envisioned by Golem and Lunyr projects.
 */
contract UpgradeableToken is StandardToken {

    /** Contract / person who can set the upgrade path. This can be the same as team multisig wallet, as what it is with its default value. */
    address public upgradeMaster;

    /** The next contract where the tokens will be migrated. */
    UpgradeAgent public upgradeAgent;

    /** How many tokens we have upgraded by now. */
    uint256 public totalUpgraded;

    /**
     * Upgrade states.
     *
     * - NotAllowed: The child contract has not reached a condition where the upgrade can bgun
     * - WaitingForAgent: Token allows upgrade, but we don't have a new agent yet
     * - ReadyToUpgrade: The agent is set, but not a single token has been upgraded yet
     * - Upgrading: Upgrade agent is set and the balance holders can upgrade their tokens
     *
     */
    enum UpgradeState {Unknown, NotAllowed, WaitingForAgent, ReadyToUpgrade, Upgrading}

    /**
     * Somebody has upgraded some of his tokens.
     */
    event Upgrade(address indexed _from, address indexed _to, uint256 _value);

    /**
     * New upgrade agent available.
     */
    event UpgradeAgentSet(address agent);

    /**
     * Do not allow construction without upgrade master set.
     */
    function UpgradeableToken(address _upgradeMaster) public {
        upgradeMaster = _upgradeMaster;
    }

    /**
     * Allow the token holder to upgrade some of their tokens to a new contract.
     */
    function upgrade(uint256 value) public {

        UpgradeState state = getUpgradeState();
        // Called in a bad state
        require(state == UpgradeState.ReadyToUpgrade || state == UpgradeState.Upgrading);

        // Validate input value.
        require(value != 0);

        balances[msg.sender] = balances[msg.sender].sub(value);

        // Take tokens out from circulation
        totalSupply_ = totalSupply_.sub(value);
        totalUpgraded = totalUpgraded.add(value);

        // Upgrade agent reissues the tokens
        upgradeAgent.upgradeFrom(msg.sender, value);
        Upgrade(msg.sender, upgradeAgent, value);
    }

    /**
     * Set an upgrade agent that handles
     */
    function setUpgradeAgent(address agent) external {

        // The token is not yet in a state that we could think upgrading
        require(canUpgrade());

        require(agent != 0x0);
        // Only a master can designate the next agent
        require(msg.sender == upgradeMaster);
        // Upgrade has already begun for an agent
        require(getUpgradeState() != UpgradeState.Upgrading);

        upgradeAgent = UpgradeAgent(agent);

        // Bad interface
        require(upgradeAgent.isUpgradeAgent());
        // Make sure that token supplies match in source and target
        require(upgradeAgent.originalSupply() == totalSupply_);

        UpgradeAgentSet(upgradeAgent);
    }

    /**
     * Get the state of the token upgrade.
     */
    function getUpgradeState() public constant returns(UpgradeState) {
        if(!canUpgrade()) return UpgradeState.NotAllowed;
        else if(address(upgradeAgent) == 0x00) return UpgradeState.WaitingForAgent;
        else if(totalUpgraded == 0) return UpgradeState.ReadyToUpgrade;
        else return UpgradeState.Upgrading;
    }

    /**
     * Change the upgrade master.
     *
     * This allows us to set a new owner for the upgrade mechanism.
     */
    function setUpgradeMaster(address master) public {
        require(master != 0x0);
        require(msg.sender == upgradeMaster);
        upgradeMaster = master;
    }

    /**
     * Child contract can enable to provide the condition when the upgrade can begun.
     */
    function canUpgrade() public view returns(bool) {
        return true;
    }

}