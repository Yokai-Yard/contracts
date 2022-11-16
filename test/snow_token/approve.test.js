import { expect } from 'chai';
import { ethers } from 'hardhat';
import { deployJbToken } from '../helpers/utils';

describe('SNOWToken::approve(...)', function () {
  const PROJECT_ID = 10;
  const name = 'TestTokenDAO';
  const symbol = 'TEST';

  async function setup() {
    const [deployer, ...addrs] = await ethers.getSigners();
    const snowToken = await deployJbToken(name, symbol);
    return { deployer, addrs, snowToken };
  }

  it('Should approve and emit event if caller is owner', async function () {
    const { deployer, addrs, snowToken } = await setup();
    const addr = addrs[1];
    const numTokens = 3000;

    const mintTx = await snowToken
      .connect(deployer)
      ['approve(uint256,address,uint256)'](PROJECT_ID, addr.address, numTokens);

    await expect(mintTx)
      .to.emit(snowToken, 'Approval')
      .withArgs(deployer.address, addr.address, numTokens);

    // overloaded functions need to be called using the full function signature
    const allowance = await snowToken
      .connect(deployer)
      ['allowance(address,address)'](deployer.address, addr.address);
    expect(allowance).to.equal(numTokens);
  });
});
