import { expect } from 'chai';
import { ethers } from 'hardhat';
import { deployJbToken } from '../helpers/utils';

describe('SNOWToken::burn(...)', function () {
  const PROJECT_ID = 10;
  const name = 'TestTokenDAO';
  const symbol = 'TEST';
  const startingBalance = 3000;

  async function setup() {
    const [deployer, ...addrs] = await ethers.getSigners();
    const snowToken = await deployJbToken(name, symbol);
    await snowToken.connect(deployer).mint(PROJECT_ID, addrs[1].address, startingBalance);
    return { deployer, addrs, snowToken };
  }

  it('Should burn token and emit event if caller is owner', async function () {
    const { deployer, addrs, snowToken } = await setup();
    const addr = addrs[1];
    const numTokens = 5;
    const burnTx = await snowToken.connect(deployer).burn(PROJECT_ID, addr.address, numTokens);

    await expect(burnTx)
      .to.emit(snowToken, 'Transfer')
      .withArgs(addr.address, ethers.constants.AddressZero, numTokens);

    // overloaded functions need to be called using the full function signature
    const balance = await snowToken['balanceOf(address,uint256)'](addr.address, PROJECT_ID);
    expect(balance).to.equal(startingBalance - numTokens);
  });

  it(`Can't burn tokens if caller isn't owner`, async function () {
    const { addrs, snowToken } = await setup();
    const nonOwner = addrs[1];
    await expect(
      snowToken.connect(nonOwner).burn(PROJECT_ID, nonOwner.address, 3000),
    ).to.be.revertedWith('Ownable: caller is not the owner');
  });

  it(`Can't burn tokens from zero address`, async function () {
    const { snowToken } = await setup();
    await expect(snowToken.burn(PROJECT_ID, ethers.constants.AddressZero, 3000)).to.be.revertedWith(
      'ERC20: burn from the zero address',
    );
  });

  it(`Can't burn tokens if burn amount exceeds balance`, async function () {
    const { addrs, snowToken } = await setup();
    const addr = addrs[1];
    const numTokens = 9001;
    await expect(snowToken.burn(PROJECT_ID, addr.address, numTokens)).to.be.revertedWith(
      'ERC20: burn amount exceeds balance',
    );
  });
});
