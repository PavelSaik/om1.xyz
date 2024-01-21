pragma solidity ^0.4.19;

import "./Haltable.sol";
import "zeppelin-solidity/contracts/math/SafeMath.sol";
import "./Omine1Token.sol";
import "./abstract/ExchangeRateReceiver.sol";

contract Omine1Crowdsale is Haltable, ExchangeRateReceiver {

    using SafeMath for uint256;

    /// Prefunding goal in Omine1 Tokens, if the funding goal is reached, preSale will stop (100k)
    uint256 public constant PRE_SALE_HARDCAP = 100e7;

    /// Prefunding min goal in Omine1 Tokens, if the prefunding goal isn't reached refund will begin (36.5k)
    uint256 public constant PRE_SALE_SOFTCAP = 36.5e7;

    /// Tokens funding goal in Omine1 Tokens, if the funding goal is reached, ico will stop (4mil)
    uint256 public constant ICO_HARDCAP = 4e10;

    /// Miminal tokens funding goal in Omine1 Tokens, if this goal isn't reached during ICO, refund will begin (1mil)
    uint256 public constant ICO_SOFTCAP = 1e10;

    /// Percent of bonus tokens team receives from each investment
    uint256 public constant TEAM_BONUS_PERCENT = 10;

    /// Duration of the presale stage
    uint256 constant public PRE_SALE_DURATION = 2 weeks;

    /// Duration of the main ICO
    uint256 constant public ICO_DURATION = 4 weeks;

    /// Min investment in Tokens ^ decimals (4)
    uint256 constant public MIN_INVESTMENT = 1e4;

    /// The token we are selling
    Omine1Token public token;

    /// tokens will be transferred from this address
    address public wallet;

    /// the UNIX timestamp start date of the crowdsale
    uint256 public icoStart;

    /// the UNIX timestamp end date of the crowdsale
    uint256 public icoEnd;

    /// the UNIX timestamp start date of the pre ico crowdsale
    uint256 public preSaleStart;

    /// the UNIX timestamp end date of the pre ico crowdsale
    uint256 public preSaleEnd;

    /// the number of tokens already sold through this contract
    uint256 public tokensSold = 0;

    /// How many wei of funding we have raised
    uint256 public weiRaised = 0;

    /// How many distinct addresses have invested
    uint256 public investorCount = 0;

    /// How much wei we have returned back to the contract after a failed crowdfund.
    uint256 public loadedRefund = 0;

    /// How much wei we have given back to investors.
    uint256 public weiRefunded = 0;

    /// Has this crowdsale been finalized
    bool public finalized;

    /// USD to Ether rate in cents
    uint256 public exchangeRate;

    /// Prices for different Token lots in USD cents
    uint256[5] public priceList;

    /// 35k and 100k token lots
    uint256[2] public preSaleTokenLots;

    /// How much ETH each address has invested to this crowdsale
    mapping (address => uint256) public investedAmountOf;

    /// How much tokens this crowdsale has credited for each investor address
    mapping (address => uint256) public tokenAmountOf;

    /**
     * State machine
     * Preparing: All contract initialization calls and variables have not been set yet
     * Prefunding: We have not passed start time yet
     * Funding: Active crowdsale
     * Success: Minimum funding goal reached
     * Failure: Minimum funding goal not reached before ending time
     * Finalized: The finalized has been called and succesfully executed
     * Refunding: Refunds are loaded on the contract for reclaim.
     */
    enum State{Unknown, Preparing, PreFunding, Funding, Success, Failure, Finalized, Refunding}

    /**
     * Event for token purchase logging
     * @param purchaser who paid for the tokens
     * @param beneficiary who got the tokens
     * @param value weis paid for purchase
     * @param amount amount of tokens purchased
     */
    event TokenPurchase(address indexed purchaser, address indexed beneficiary, uint256 value, uint256 amount);

    /// Refund was processed for a contributor
    event Refunded(address indexed holder, uint amount);

    /// Crowdsale start time has been changed
    event IcoStartChanged(uint256 icoStart);

    /// PreSale start time has been changed
    event PreSaleStartChanged(uint256 preSaleStart);

    /// Calculated new price
    event ExchangeRateChanged(uint256 oldValue, uint256 newValue);

    /// @dev Modified allowing execution only if the crowdsale is currently running
    modifier inState(State state) {
        require(getState() == state);
        _;
    }

    /**
     * Constructor
     * @param _baseExchangeRate base USD to Ether rate in cents
     * @param _wallet Address where collected funds will be forwarded to
     * @param _preSaleStart preICO start date
     * @param _token Omine1 Token address
     */
    function Omine1Crowdsale(uint256 _baseExchangeRate, address _wallet, uint256 _preSaleStart, Omine1Token _token) public {
        require(_baseExchangeRate > 0);
        require(_wallet != address(0));
        require(_token != address(0));
        require(_preSaleStart >= now);

        exchangeRate = _baseExchangeRate;
        wallet = _wallet;
        token = _token;

        preSaleStart = _preSaleStart;
        preSaleEnd = preSaleStart + PRE_SALE_DURATION;

        icoStart = preSaleEnd;
        icoEnd = icoStart + ICO_DURATION;
        // Set prices for different Token lots in USD cents [0-35k, 35k-100k, 1 week, 2-3 week, 4 week]
        priceList = [uint256(68), 80, 90, 100, 110];
        // 0-35k and 35k-100k token lots
        preSaleTokenLots = [uint256(35e7), 100e7];
    }

    /**
     * @dev fallback function
     */
    function () external payable {
        buyTokens(msg.sender);
    }

    /**
     * @dev Make an investment. Crowdsale must be running for one to invest.
     * @param _beneficiary Address performing the token purchase
     */
    function buyTokens(address _beneficiary) stopInEmergency public payable {

        var state = getState();
        require(state == State.Funding || state == State.PreFunding);

        uint256 weiAmount = msg.value;
        // calculate token amount to be created
        uint256 tokensAmount = 0;

        // 10 ** token.decimals();
        uint256 multiplier = 10000;

        uint256 usdAmount = _weiToUsdCents(weiAmount);
        // amount of USD cents to refund - we will decrease it when calculating Tokens num
        uint256 usdRefundAmount = usdAmount;

        if(state == State.PreFunding) {

            // max total USD cents price available for purchase
            uint256 usdMaxLotAmount = 0;

            for (uint256 i = 0; i < 2; i++) {
                if(tokensSold.add(tokensAmount) < preSaleTokenLots[i]) {
                    usdMaxLotAmount = preSaleTokenLots[i].sub(tokensSold.add(tokensAmount)).mul(priceList[i]).div(multiplier);
                    // if within lot maximum
                    if(usdRefundAmount <= usdMaxLotAmount)
                    {
                        tokensAmount += usdRefundAmount.mul(multiplier).div(priceList[i]);
                        usdRefundAmount = 0;
                        break;
                    }
                    else {
                        // limit Tokens num to maximum lot value only
                        tokensAmount += usdMaxLotAmount.mul(multiplier).div(priceList[i]);
                        usdRefundAmount -= usdMaxLotAmount;
                    }
                }
            }
        }
        else {
            // no refunds on main ICO
            usdRefundAmount = 0;
            // ico price according to week number
            var price = priceList[4];
            if(now < icoStart + 1 weeks)
                price = priceList[2];
            else if (now < icoStart + 3 weeks)
                price = priceList[3];
            // calculate tokens num
            tokensAmount = usdAmount.mul(multiplier).div(price);
            // refund if more than HARDCAP
            if(tokensSold.add(tokensAmount) > ICO_HARDCAP)
            {
                tokensAmount = ICO_HARDCAP.sub(tokensSold);
                usdRefundAmount = usdAmount.sub(tokensAmount.div(multiplier).mul(price));
            }
        }

        require (tokensAmount >= MIN_INVESTMENT);

        if(usdRefundAmount > 0)
            weiAmount = usdAmount.sub(usdRefundAmount).mul(1 ether).div(exchangeRate);

        if(investedAmountOf[_beneficiary] == 0) {
            // A new investor
            investorCount++;
        }

        // Update investor
        investedAmountOf[_beneficiary] = weiAmount.add(investedAmountOf[_beneficiary]);
        tokenAmountOf[_beneficiary] = tokensAmount.add(tokenAmountOf[_beneficiary]);

        // Update totals
        weiRaised = weiRaised.add(weiAmount);
        tokensSold = tokensSold.add(tokensAmount);

        _deliverTokens(_beneficiary, tokensAmount);

        // save funds in the wallet
        _forwardFunds(weiAmount);

        // Tell us invest was success
        TokenPurchase(msg.sender, _beneficiary, weiAmount, tokensAmount);

        // refund eth if max presale Tokens amount exceeded
        if(usdRefundAmount > 0 && msg.value - weiAmount > 0)
            msg.sender.transfer(msg.value.sub(weiAmount));
    }

    /**
     * @dev Finalize a successful crowdsale.
     *
     */
    function finalize() public inState(State.Success) onlyOwner stopInEmergency {
        finalized = true;
        // calculate team tokens
        var teamBonusTokens = tokensSold.div(100).mul(TEAM_BONUS_PERCENT);
        _deliverTokens(wallet, teamBonusTokens);
        token.finishMinting();
        token.releaseTokenTransfer();
        token.setFreezingDate(now + 2 years);
    }

    /**
     * @dev Method for setting USD to Ether rate via Oraclize
     * @param ethUsdPrice USD amount in cents for 1 Ether
     */
    function setExchangeRate(uint256 ethUsdPrice) external onlyExchangeRateProvider {
        require(ethUsdPrice > 0);
        ExchangeRateChanged(exchangeRate, ethUsdPrice);
        exchangeRate = ethUsdPrice;
    }

    /**
     * @dev Method set exchange rate provider
     * @param provider new provider
     */
    function setExchangeRateProvider(address provider) external onlyOwner {
        require(provider != 0x0);
        exchangeRateProvider = provider;
    }

    /**
     * @dev Allow crowdsale owner to start the main ICO earlier or postpone
     * @param time timestamp
     */
    function setIcoStart(uint256 time) external onlyOwner {
        require(now < icoStart);
        require(time >= now);
        // not later than 1.5 months after preSale
        require(time < preSaleEnd + 6 weeks);
        // check if it is later than preSale or preSale is finished
        require(time >= preSaleEnd || (now > preSaleStart && tokensSold >= PRE_SALE_HARDCAP));
        icoStart = time;
        icoEnd = time + ICO_DURATION;
        IcoStartChanged(icoStart);
    }

    /**
     * @dev Allow crowdsale owner to start the main preSale earlier or postpone
     * @param time timestamp
     */
    function setPreSaleStart(uint256 time) external onlyOwner {
        require(now < preSaleStart);
        require(time >= now);
        preSaleStart = time;
        preSaleEnd = preSaleStart + PRE_SALE_DURATION;
        PreSaleStartChanged(preSaleStart);
        if(preSaleEnd > icoStart)
        {
            icoStart = preSaleEnd;
            icoEnd = icoStart + ICO_DURATION;
            IcoStartChanged(icoStart);
        }
    }

    /**
     * @dev Allow load refunds back on the contract for the refunding.
     *
     */
    function loadRefund() public payable inState(State.Failure) {
        require(msg.value > 0);
        loadedRefund = loadedRefund.add(msg.value);
    }

    /**
     * @dev Investors can claim refund
     *
     */
    function refund() public inState(State.Refunding) {
        uint256 weiValue = investedAmountOf[msg.sender];
        require (weiValue > 0);
        investedAmountOf[msg.sender] = 0;
        weiRefunded = weiRefunded.add(weiValue);
        Refunded(msg.sender, weiValue);
        msg.sender.transfer(weiValue);
    }

    /**
     * @dev Crowdsale state management.
     * @return State current state
     */
    function getState() public view returns (State) {
        if (finalized)
            return State.Finalized;
        if (now < icoStart) {
            // if preSale hasn't started OR preSale Goal reached OR preSale ended with min Goal and waiting for ICO
            if(now < preSaleStart || tokensSold >= PRE_SALE_HARDCAP || (now > preSaleEnd && tokensSold >= PRE_SALE_SOFTCAP))
                return State.Preparing;
            // if preSale active
            if(now < preSaleEnd && tokensSold < PRE_SALE_HARDCAP)
                return State.PreFunding;
        } else if (now < icoEnd) {
            // check if preSale was successful AND max ICO Goal is not reached
            if(tokensSold >= PRE_SALE_SOFTCAP && tokensSold < ICO_HARDCAP)
                return State.Funding;
        }
        if (tokensSold >= ICO_HARDCAP || (now >= icoEnd && tokensSold >= ICO_SOFTCAP))
            return State.Success;
        if (weiRaised > 0 && loadedRefund >= weiRaised)
            return State.Refunding;
        return State.Failure;
    }

    /**
     * @dev Assign tokens
     * @param _beneficiary Address performing the token purchase
     * @param _tokenAmount Number of tokens to be emitted
     */
    function _deliverTokens(address _beneficiary, uint256 _tokenAmount) internal {
        token.mint(_beneficiary, _tokenAmount);
    }

    /**
     * @dev Converts wei value into USD cents according to current exchange rate
     * @param weiValue wei value to convert
     * @return tokenAmount The amount of tokens we try to give to the investor in the current transaction
     */
    function _weiToUsdCents(uint256 weiValue) private view returns (uint256) {
        return weiValue.mul(exchangeRate).div(1 ether);
    }

    /**
     * @dev Determines how ETH is stored/forwarded on purchases.
     * @param weiAmount wei value to transfer
     */
    function _forwardFunds(uint256 weiAmount) internal {
        wallet.transfer(weiAmount);
    }

    function transferTokenOwnership(address _newOwner) public onlyOwner {
        token.transferOwnership(_newOwner);
    }
}