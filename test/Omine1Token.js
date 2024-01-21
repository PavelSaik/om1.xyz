const Omine1Token = artifacts.require("Omine1Token");
const assertJump = function(error) {
  assert.isAbove(error.message.search('VM Exception while processing transaction: revert'), -1, 'Invalid opcode error must be returned');
};

contract('Omine1Token', accounts => {
    
    let token;
    const creator = accounts[0];
    const wallet = accounts[5];
    
    beforeEach(async function () {
        token = await Omine1Token.new(creator, wallet, { from: creator });
    });
    
    it('has a name', async function () {
        const name = await token.name();
        assert.equal(name, 'Omine.1 Token');
    });
    
    it('has a symbol', async function () {
        const symbol = await token.symbol();
        assert.equal(symbol, 'OM1');
    });
    
    it('has 4 decimals', async function () {
        const decimals = await token.decimals();
        assert(decimals.eq(4));
    });

    it("should not allow to set freezingDate by not owner", async function () {
        const date = web3.eth.getBlock('latest').timestamp + 60 * 60 * 24 * 365;
        try {
            await token.setFreezingDate(date, {from: accounts[1]});
        } catch (error) {
            return assertJump(error);
        }
        assert.fail('should have thrown before');
    });

    it("should not allow to set freezingDate earlier then now", async function () {
        const date = web3.eth.getBlock('latest').timestamp - 300;
        try {
            await token.setFreezingDate(date, {from: accounts[0]});
        } catch (error) {
            return assertJump(error);
        }
        assert.fail('should have thrown before');
    });

    it("should allow to set freezingDate later then now by owner", async function () {
        const date = web3.eth.getBlock('latest').timestamp + 60 * 60 * 24 * 365;
        await token.setFreezingDate(date);
        const freezingDate = await token.freezingDate();
        assert.equal(freezingDate, date)
    });

    it("should allow to release by owner", async () => {
        await token.releaseTokenTransfer({from: accounts[0]});
        const released = await token.released();
        assert.equal(released, true);
    });

    it("should not allow transfer when token is not released", async function() {
        try {
            await token.transfer(accounts[1], 100);
        } catch (error) {
            return assertJump(error);
        }
        assert.fail('should have thrown before');
    });

    it("should allow transfer when token is released", async function() {

        await token.mint(accounts[2], 35000000 * 10 ** 4, { from: accounts[0] });

        await token.releaseTokenTransfer();

        await token.transfer(accounts[1], 100 * 10 ** 4, { from: accounts[2] });

        const balance0 = await token.balanceOf(accounts[2]);
        assert.equal(balance0.valueOf(), 34999900 * 10 ** 4);

        const balance1 = await token.balanceOf(accounts[1]);
        assert.equal(balance1.valueOf(), 100 * 10 ** 4);
    });

    it("should allow transfer when token is released - fractional value", async function() {

        await token.mint(accounts[2], 35000000 * 10 ** 4, { from: accounts[0] });

        await token.releaseTokenTransfer();

        await token.transfer(accounts[1], 0.0001 * 10 ** 4, { from: accounts[2] });

        const balance0 = await token.balanceOf(accounts[2]);
        assert.equal(balance0.valueOf(), 34999999.9999 * 10 ** 4);

        const balance1 = await token.balanceOf(accounts[1]);
        assert.equal(balance1.valueOf(), 0.0001 * 10 ** 4);
    });

    it("should not allow transferFrom when token is not released", async function() {

        await token.approve(accounts[1], 100 * 10 ** 18);

        try {
            await token.transferFrom(accounts[0], accounts[2], 100 * 10 ** 18, {from: accounts[1]});
        } catch (error) {
            return assertJump(error);
        }
        assert.fail('should have thrown before');
    });

    it("should allow transferFrom when token is released", async function() {

        await token.mint(accounts[3], 35000000 * 10 ** 4, { from: accounts[0] });

        await token.releaseTokenTransfer();

        await token.approve(accounts[1], 100 * 10 ** 4, { from: accounts[3] });
        await token.transferFrom(accounts[3], accounts[2], 100 * 10 ** 4, {from: accounts[1]});

        const balance0 = await token.balanceOf(accounts[3]);
        assert.equal(balance0.valueOf(), 34999900 * 10 ** 4);

        const balance1 = await token.balanceOf(accounts[2]);
        assert.equal(balance1.valueOf(), 100 * 10 ** 4);

        const balance2 = await token.balanceOf(accounts[1]);
        assert.equal(balance2.valueOf(), 0);
    });

    it("should allow transferFrom when token is released", async function() {

        await token.mint(accounts[3], 35000000 * 10 ** 4, { from: accounts[0] });

        await token.releaseTokenTransfer();

        await token.approve(accounts[1], 100 * 10 ** 4, { from: accounts[3] });
        await token.transferFrom(accounts[3], accounts[2], 100 * 10 ** 4, {from: accounts[1]});

        const balance0 = await token.balanceOf(accounts[3]);
        assert.equal(balance0.valueOf(), 34999900 * 10 ** 4);

        const balance1 = await token.balanceOf(accounts[2]);
        assert.equal(balance1.valueOf(), 100 * 10 ** 4);

        const balance2 = await token.balanceOf(accounts[1]);
        assert.equal(balance2.valueOf(), 0);
    });

    it("should not allow transfer of team tokens before freezingDate", async function() {

        await token.mint(accounts[5], 35000000 * 10 ** 4, { from: accounts[0] });

        await token.releaseTokenTransfer();

        const date = web3.eth.getBlock('latest').timestamp + 60 * 60 * 24 * 365;

        await token.setFreezingDate(date);

        try {
            await token.transfer(accounts[1], 10 ** 4, { from: accounts[5] });
        } catch (error) {
            return assertJump(error);
        }
        assert.fail('should have thrown before');
    });

    it("should allow transfer of team tokens after freezingDate", async function() {

        const increaseTime = addSeconds => {
            web3.currentProvider.send({
                jsonrpc: "2.0",
                method: "evm_increaseTime",
                params: [addSeconds], id: 0
            })
        }

        await token.mint(accounts[5], 35000000 * 10 ** 4, { from: accounts[0] });

        await token.releaseTokenTransfer();

        const date = web3.eth.getBlock('latest').timestamp + 60 * 60 * 24 * 365;

        await token.setFreezingDate(date);

        increaseTime(60 * 60 * 24 * 366);

        await token.transfer(accounts[1], 100 * 10 ** 4, { from: accounts[5] });

        const balance0 = await token.balanceOf(accounts[5]);
        assert.equal(balance0.valueOf(), 34999900 * 10 ** 4);

        const balance1 = await token.balanceOf(accounts[1]);
        assert.equal(balance1.valueOf(), 100 * 10 ** 4);
    });
    
});