const Omine1Token = artifacts.require("Omine1Token");
const Omine1Crowdsale = artifacts.require("Omine1Crowdsale");

const assertJump = function(error) {
  assert.isAbove(error.message.search('VM Exception while processing transaction: revert'), -1, 'Invalid opcode error must be returned');
};

const baseExchangeRate = 100000; // 1000 USD
const wallet = web3.eth.accounts[5];
const account = web3.eth.accounts[0];
const ethPriceProvider = web3.eth.accounts[6];

const increaseTime = addSeconds => {
    web3.currentProvider.send({
        jsonrpc: "2.0",
        method: "evm_increaseTime",
        params: [addSeconds], id: 0
    })
}

contract('Omine1Crowdsale', function (accounts) {

    beforeEach(async function () {

        this.preSaleStart = web3.eth.getBlock('latest').timestamp + 300;
        this.token = await Omine1Token.new(account, wallet);

        this.crowdsale = await Omine1Crowdsale.new(baseExchangeRate, wallet, this.preSaleStart, this.token.address);

        await this.token.transferOwnership(this.crowdsale.address, { from: accounts[0] });
        await this.crowdsale.setExchangeRateProvider(ethPriceProvider);
    });

    describe('common situations', function () {

        it('should allow to halt by owner', async function () {
            await this.crowdsale.halt();

            const halted = await this.crowdsale.halted();

            assert.equal(halted, true);
        });

        it('should not allow to halt by not owner', async function () {
            try {
                await this.crowdsale.halt({from: accounts[2]});
            } catch (error) {
                return assertJump(error);
            }
            assert.fail('should have thrown before');
        });

        it('should allow to unhalt by owner', async function () {
            await this.crowdsale.halt();

            await this.crowdsale.unhalt();
            const halted = await this.crowdsale.halted();

            assert.equal(halted, false);
        });

        it('should not allow to unhalt when not halted', async function () {
            try {
                await this.crowdsale.unhalt();
            } catch (error) {
                return assertJump(error);
            }
            assert.fail('should have thrown before');
        });

        it('should not allow to unhalt by not owner', async function () {
            await this.crowdsale.halt();

            try {
                await this.crowdsale.unhalt({from: accounts[2]});
            } catch (error) {
                return assertJump(error);
            }
            assert.fail('should have thrown before');
        });

        it('should allow to update ETH price by ETH price provider', async function () {
            await this.crowdsale.setExchangeRate(25000, {from: ethPriceProvider});

            const ethUsdRate = await this.crowdsale.exchangeRate();

            assert.equal(ethUsdRate, 25000);
        });

        it('should not allow to update ETH price by not ETH price provider', async function () {
            try {
                await this.crowdsale.setExchangeRate(25000, {from: accounts[2]});
            } catch (error) {
                return assertJump(error);
            }
            assert.fail('should have thrown before');
        });

        it('should allow to set ETH price provider by owner', async function () {
            await this.crowdsale.setExchangeRateProvider(accounts[2], {from: accounts[0]});

            const newExchangeRateProvider = await this.crowdsale.exchangeRateProvider();

            assert.equal(accounts[2], newExchangeRateProvider);
        });

        it('should not allow to set ETH price provider by not owner', async function () {
            try {
                await this.crowdsale.setExchangeRateProvider(accounts[2], {from: accounts[2]});
            } catch (error) {
                return assertJump(error);
            }
            assert.fail('should have thrown before');
        });

        it('should not allow to update eth price with zero value', async function () {
            try {
                await this.crowdsale.setExchangeRate(0, {from: ethPriceProvider});
            } catch (error) {
                return assertJump(error);
            }
            assert.fail('should have thrown before');
        });

        it('should not allow to set preSaleStart by not owner', async function () {
            try {
                await this.crowdsale.setPreSaleStart(web3.eth.getBlock('latest').timestamp + 300, {from: accounts[2]});
            } catch (error) {
                return assertJump(error);
            }
            assert.fail('should have thrown before');
        });

        it('should not allow to change preSaleStart when already active', async function () {

            increaseTime(600); // 5 mins after start

            try {
                await this.crowdsale.setPreSaleStart(web3.eth.getBlock('latest').timestamp + 300);
            } catch (error) {
                return assertJump(error);
            }
            assert.fail('should have thrown before');
        });

        it('should allow to change preSaleStart later than now', async function () {

            const newTime = web3.eth.getBlock('latest').timestamp + 900;
            await this.crowdsale.setPreSaleStart(newTime);

            const changedPreSaleStart = await this.crowdsale.preSaleStart();
            assert.equal(changedPreSaleStart, newTime);

            const changedPreSaleEnd = await this.crowdsale.preSaleEnd();
            assert.equal(changedPreSaleEnd, newTime + 60 * 60 * 24 * 14);

            const changedIcoStart = await this.crowdsale.icoStart();
            assert.equal(changedIcoStart, newTime + 60 * 60 * 24 * 14);

            const changedIcoEnd = await this.crowdsale.icoEnd();
            assert.equal(changedIcoEnd, newTime + 60 * 60 * 24 * 42);
        });

        it('should not allow to set icoStart by not owner', async function () {
            try {
                await this.crowdsale.setIcoStart(web3.eth.getBlock('latest').timestamp + 300, {from: accounts[2]});
            } catch (error) {
                return assertJump(error);
            }
            assert.fail('should have thrown before');
        });

        it('should not allow to change icoStart when already active', async function () {

            increaseTime(600); // 5 mins after start

            await this.crowdsale.sendTransaction({value: 50 * 10 ** 18, from: accounts[2]});

            increaseTime(60 * 60 * 24 * 14);

            try {
                await this.crowdsale.setIcoStart(web3.eth.getBlock('latest').timestamp + 300);
            } catch (error) {
                return assertJump(error);
            }
            assert.fail('should have thrown before');
        });

        it('should not allow to change icoStart earlier than preSaleEnd', async function () {

            increaseTime(600); // 5 mins after start

            try {
                await this.crowdsale.setIcoStart(web3.eth.getBlock('latest').timestamp + 999);
            } catch (error) {
                return assertJump(error);
            }
            assert.fail('should have thrown before');
        });

        it('should allow to change icoStart later than preSaleEnd if not active', async function () {

            increaseTime(600); // 5 mins after start

            const newTime = web3.eth.getBlock('latest').timestamp + 60 * 60 * 24 * 28;
            await this.crowdsale.setIcoStart(newTime);

            const changedIcoStart = await this.crowdsale.icoStart();
            assert.equal(changedIcoStart, newTime);

            const changedIcoEnd = await this.crowdsale.icoEnd();
            assert.equal(changedIcoEnd, newTime + 60 * 60 * 24 * 28);
        });

    });

    describe('pre-sale phase', function () {

        it('should not allow purchase before pre sale start', async function () {
            try {
                await this.crowdsale.sendTransaction({value: 0.11 * 10 ** 18, from: accounts[2]});
            } catch (error) {
                return assertJump(error);
            }
            assert.fail('should have thrown before');
        });

        it('should not allow purchase when crowdsale is halted', async function () {
            await this.crowdsale.halt();

            try {
                await this.crowdsale.sendTransaction({value: 0.11 * 10 ** 18, from: accounts[2]});
            } catch (error) {
                return assertJump(error);
            }
            assert.fail('should have thrown before');
        });

        it('buy 100k tokens at once during presale & refund ~24 ETH', async function () {

            increaseTime(600); // 5 mins after start

            const balanceBefore = web3.eth.getBalance(accounts[2]);

            await this.crowdsale.sendTransaction({value: 100 * 10 ** 18, from: accounts[2]});

            const balanceAfter = web3.eth.getBalance(accounts[2]);

            assert.equal(balanceBefore - balanceAfter < 76 * 10 ** 18, true);

            const tokensSold = await this.crowdsale.tokensSold();
            assert.equal(tokensSold.valueOf(), 100000 * 10 ** 4);
        });

        it('buy 100k (1k*$0.68 + 34k*$0.68+1k*$0.8 + 64k*$0.8) tokens buy during presale and refund the change', async function () {

            increaseTime(600); // 5 mins after start

            await this.crowdsale.sendTransaction({value: 0.68 * 10 ** 18, from: accounts[2]});

            const balance2 = await this.token.balanceOf(accounts[2]);
            assert.equal(balance2.valueOf(), 1000 * 10 ** 4);

            // buy 34k*$0.68+1k*$0.8
            await this.crowdsale.sendTransaction({value: 23.92 * 10 ** 18, from: accounts[3]});

            const balance3 = await this.token.balanceOf(accounts[3]);
            assert.equal(balance3.valueOf(), 35000 * 10 ** 4);

            // buy 64k*$0.8
            await this.crowdsale.sendTransaction({value: 52 * 10 ** 18, from: accounts[4]});

            const balance4 = await this.token.balanceOf(accounts[4]);
            assert.equal(balance4.valueOf(), 64000 * 10 ** 4);

            const investorCount = await this.crowdsale.investorCount();
            assert.equal(investorCount, 3);

            const weiRaised = await this.crowdsale.weiRaised();
            assert.equal(weiRaised.valueOf(), 75.8 * 10 ** 18);

            const tokensSold = await this.crowdsale.tokensSold();
            assert.equal(tokensSold.valueOf(), 100000 * 10 ** 4);
        });

        it('should not allow to buy less than 1.0000 OM1', async function () {
            increaseTime(600); // 5 mins after start
            try {
                await this.crowdsale.sendTransaction({value: 0.0001 * 10 ** 18, from: accounts[2]});
            } catch (error) {
                return assertJump(error);
            }
            assert.fail('should have thrown before');
        });

        it('should not allow purchase after preSale hardcap reached', async function () {

            increaseTime(600); // 5 mins after start

            await this.crowdsale.sendTransaction({value: 100 * 10 ** 18, from: accounts[2]});

            try {
                await this.crowdsale.sendTransaction({value: 0.11 * 10 ** 18, from: accounts[3]});
            } catch (error) {
                return assertJump(error);
            }
            assert.fail('should have thrown before');
        });

        it('should not allow purchase if pre sale is ended with softcap reached and ICO has not started', async function () {

            increaseTime(600); // 5 mins after start

            const week = 60 * 60 * 24 * 7;

            await this.crowdsale.setIcoStart(this.preSaleStart + week * 4);

            await this.crowdsale.sendTransaction({value: 30 * 10 ** 18, from: accounts[2]});

            increaseTime(week * 2);

            try {
                await this.crowdsale.sendTransaction({value: 0.1 * 10 ** 18, from: accounts[2]});
            } catch (error) {
                return assertJump(error);
            }
            assert.fail('should have thrown before');
        });

        it('should not allow refund if Status not in Refund', async function () {

            increaseTime(600); // 5 mins after start

            try {
                await this.crowdsale.refund({from: accounts[2]});
            } catch (error) {
                return assertJump(error);
            }
            assert.fail('should have thrown before');
        });

        it('should not allow refund if cap is reached', async function () {

            increaseTime(600); // 5 mins after start

            const week = 60 * 60 * 24 * 7;

            await this.crowdsale.setIcoStart(this.preSaleStart + week * 4);

            await this.crowdsale.sendTransaction({value: 30 * 10 ** 18, from: accounts[2]});

            increaseTime(week * 2);

            try {
                await this.crowdsale.refund({from: accounts[2]});
            } catch (error) {
                return assertJump(error);
            }
            assert.fail('should have thrown before');
        });

        it('should refund if cap is not reached and pre sale is ended and Refund loaded', async function () {

            increaseTime(600); // 5 mins after start

            const week = 60 * 60 * 24 * 7;

            await this.crowdsale.sendTransaction({value: 2 * 10 ** 18, from: accounts[2]});

            increaseTime(week * 2);

            await this.crowdsale.loadRefund({ value: 3 * 10 ** 18, from: wallet });

            const balanceBefore = web3.eth.getBalance(accounts[2]);
            await this.crowdsale.refund({from: accounts[2]});

            const balanceAfter = web3.eth.getBalance(accounts[2]);

            assert.equal(balanceAfter > balanceBefore, true);

            const weiRefunded = await this.crowdsale.weiRefunded();
            assert.equal(weiRefunded, 2 * 10 ** 18);

            //should not refund 1 more time
            try {
                await this.crowdsale.refund({from: accounts[2]});
            } catch (error) {
                return assertJump(error);
            }
            assert.fail('should have thrown before');
        });

    });

    describe('main ICO phase', function () {

        it('should not allow to exceed hard cap', async function () {

            increaseTime(600); // 5 mins after start

            const week = 60 * 60 * 24 * 7;

            await this.crowdsale.sendTransaction({value: 100 * 10 ** 18, from: accounts[2]});

            increaseTime(week * 4);

            await this.crowdsale.sendTransaction({value: 2500 * 10 ** 18, from: accounts[1]});
            await this.crowdsale.sendTransaction({value: 1400 * 10 ** 18, from: accounts[2]});

            const tokensSold = await this.crowdsale.tokensSold();
            assert.equal(tokensSold.valueOf(), 4000000 * 10 ** 4);

            try {
                await this.crowdsale.sendTransaction({value: 100 * 10 ** 18, from: accounts[4]});
            } catch (error) {
                return assertJump(error);
            }
            assert.fail('should have thrown before');
        });

        it('should not allow to buy after ICO end', async function () {

            increaseTime(600); // 5 mins after start

            const week = 60 * 60 * 24 * 7;

            await this.crowdsale.sendTransaction({value: 100 * 10 ** 18, from: accounts[2]});

            increaseTime(week * 4);

            await this.crowdsale.sendTransaction({value: 1400 * 10 ** 18, from: accounts[1]});

            increaseTime(week * 2);

            try {
                await this.crowdsale.sendTransaction({value: 100 * 10 ** 18, from: accounts[4]});
            } catch (error) {
                return assertJump(error);
            }
            assert.fail('should have thrown before');
        });

        it('should allow to buy until HARDCAP and refund the change', async function () {

            increaseTime(600); // 5 mins after start

            const week = 60 * 60 * 24 * 7;

            // buy 55k tokens
            await this.crowdsale.sendTransaction({value: 39.8 * 10 ** 18, from: accounts[1]});

            let balance1 = await this.token.balanceOf(accounts[1]);
            assert.equal(balance1.valueOf(), 55000 * 10 ** 4);

            increaseTime(week * 2);

            // first ICO week - 0.9 USD
            await this.crowdsale.sendTransaction({value: 900 * 10 ** 18, from: accounts[2]});

            const balance2 = await this.token.balanceOf(accounts[2]);
            assert.equal(balance2.valueOf(), 1000000 * 10 ** 4);

            increaseTime(week);

            // second ICO week - 1.0 USD
            await this.crowdsale.sendTransaction({value: 2000 * 10 ** 18, from: accounts[1]});

            balance1 = await this.token.balanceOf(accounts[1]);
            assert.equal(balance1.valueOf(), 2055000 * 10 ** 4);

            increaseTime(week * 2);

            // last ICO week - 1.1 USD
            await this.crowdsale.sendTransaction({value: 1100 * 10 ** 18, from: accounts[3]});

            const balance3 = await this.token.balanceOf(accounts[3]);
            assert.equal(balance3.valueOf(), 945000 * 10 ** 4);

            const investorCount = await this.crowdsale.investorCount();
            assert.equal(investorCount, 3);

            const weiRaised = await this.crowdsale.weiRaised();
            assert.equal(weiRaised.valueOf() > 3979 * 10 ** 18, true);
            assert.equal(weiRaised.valueOf() < 3980 * 10 ** 18, true);

            const tokensSold = await this.crowdsale.tokensSold();
            assert.equal(tokensSold.valueOf(), 4000000 * 10 ** 4);
        });

        it('should allow finalize only for owner', async function () {
            try {
                await this.crowdsale.finalize({from: accounts[1]});
            } catch (error) {
                return assertJump(error);
            }
            assert.fail('should have thrown before');
        });

        it('should not allow to finalize if ICO failed (softcap not reached)', async function () {

            increaseTime(600); // 5 mins after start

            const week = 60 * 60 * 24 * 7;

            await this.crowdsale.sendTransaction({value: 100 * 10 ** 18, from: accounts[2]});

            increaseTime(week * 4);

            await this.crowdsale.sendTransaction({value: 850 * 10 ** 18, from: accounts[1]});

            increaseTime(week * 2);

            const tokensSold = await this.crowdsale.tokensSold();
            assert.equal(tokensSold.valueOf(), 950000 * 10 ** 4);

            try {
                await this.crowdsale.finalize();
            } catch (error) {
                return assertJump(error);
            }
            assert.fail('should have thrown before');
        });

        it('should allow finalize successful ICO & give 10% bonus to team wallet', async function () {

            increaseTime(600); // 5 mins after start

            const week = 60 * 60 * 24 * 7;

            const oldWalletBalanceEth = web3.eth.getBalance(wallet);

            await this.crowdsale.sendTransaction({value: 100 * 10 ** 18, from: accounts[2]});

            increaseTime(week * 4);

            await this.crowdsale.sendTransaction({value: 900 * 10 ** 18, from: accounts[1]});

            increaseTime(week * 2);

            await this.crowdsale.finalize();

            const newWalletBalanceEth = web3.eth.getBalance(wallet);
            const newWalletBalanceOm1 = await this.token.balanceOf(wallet).valueOf();
            const icoContractBalanceOm1 = await this.token.balanceOf(this.crowdsale.address).valueOf();
            const icoContractBalanceEth = web3.eth.getBalance(this.crowdsale.address);

            assert.equal(icoContractBalanceOm1, 0);
            assert.equal(icoContractBalanceEth, 0);

            const weiRaised = await this.crowdsale.weiRaised();
            assert.equal(newWalletBalanceEth.minus(oldWalletBalanceEth).toNumber(), weiRaised);

            assert.equal(newWalletBalanceOm1, 100000 * 10 ** 4);
        });

        it('should not allow refund if ICO is not ended', async function () {

            increaseTime(600); // 5 mins after start

            const week = 60 * 60 * 24 * 7;

            await this.crowdsale.sendTransaction({value: 100 * 10 ** 18, from: accounts[2]});

            increaseTime(week * 4);

            await this.crowdsale.sendTransaction({value: 850 * 10 ** 18, from: accounts[1]});

            try {
                await this.crowdsale.refund({from: accounts[2]});
            } catch (error) {
                return assertJump(error);
            }
            assert.fail('should have thrown before');
        });

        it('should not allow refund if ICO soft cap is reached', async function () {

            increaseTime(600); // 5 mins after start

            const week = 60 * 60 * 24 * 7;

            await this.crowdsale.sendTransaction({value: 100 * 10 ** 18, from: accounts[2]});

            increaseTime(week * 4);

            await this.crowdsale.sendTransaction({value: 900 * 10 ** 18, from: accounts[1]});

            increaseTime(week * 2);

            try {
                await this.crowdsale.refund({from: accounts[1]});
            } catch (error) {
                return assertJump(error);
            }
            assert.fail('should have thrown before');
        });

        it('should refund if softcap is not reached and ICO ended', async function () {

            increaseTime(600); // 5 mins after start

            const week = 60 * 60 * 24 * 7;

            await this.crowdsale.sendTransaction({value: 39.8 * 10 ** 18, from: accounts[2]});

            increaseTime(week * 4);

            await this.crowdsale.sendTransaction({value: 850 * 10 ** 18, from: accounts[1]});

            increaseTime(week * 2);

            await this.crowdsale.loadRefund({ value: 889.8 * 10 ** 18, from: wallet });

            const balanceBefore = web3.eth.getBalance(accounts[2]);
            await this.crowdsale.refund({from: accounts[2]});

            const balanceAfter = web3.eth.getBalance(accounts[2]);

            assert.equal(balanceAfter > balanceBefore, true);

            const weiRefunded = await this.crowdsale.weiRefunded();
            assert.equal(weiRefunded, 39.8 * 10 ** 18);

            const investedAmount = await this.crowdsale.investedAmountOf(accounts[2]);
            assert.equal(investedAmount.toNumber(), 0);

            //should not refund 1 more time
            try {
                await this.crowdsale.refund({from: accounts[2]});
            } catch (error) {
                return assertJump(error);
            }
            assert.fail('should have thrown before');
        });
    });

});
