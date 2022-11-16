import { expect } from 'chai';
import { ethers } from 'hardhat';
import { deployJbToken } from '../helpers/utils';

describe('SNOWToken::transferFrom(...)', function () {
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

  it('Should transfer token and emit event if caller is owner', async function () {
    const { addrs, snowToken } = await setup();
    const numTokens = 5;
    await snowToken.connect(addrs[1])['approve(address,uint256)'](addrs[3].address, numTokens);
    const transferTx = await snowToken
      .connect(addrs[3])
      ['transferFrom(uint256,address,address,uint256)'](
        PROJECT_ID,
        addrs[1].address,
        addrs[2].address,
        numTokens,
      );

    await expect(transferTx)
      .to.emit(snowToken, 'Transfer')
      .withArgs(addrs[1].address, addrs[2].address, numTokens);

    // overloaded functions need to be called using the full function signature
    const balance = await snowToken['balanceOf(address,uint256)'](addrs[1].address, PROJECT_ID);
    expect(balance).to.equal(startingBalance - numTokens);
  });

  it(`Can't transfer tokens if caller doesn't have approval`, async function () {
    const { addrs, snowToken } = await setup();
    const numTokens = 5;

    await expect(
      snowToken
        .connect(addrs[1])
        ['transferFrom(uint256,address,address,uint256)'](
          PROJECT_ID,
          addrs[1].address,
          addrs[2].address,
          numTokens,
        ),
    ).to.be.revertedWith('ERC20: transfer amount exceeds allowance');
  });

  it(`Can't transfer to zero address`, async function () {
    const { addrs, snowToken } = await setup();
    const numTokens = startingBalance + 1;
    await snowToken.connect(addrs[1])['approve(address,uint256)'](addrs[3].address, numTokens);
    await expect(
      snowToken
        .connect(addrs[3])
        ['transferFrom(uint256,address,address,uint256)'](
          PROJECT_ID,
          addrs[1].address,
          ethers.constants.AddressZero,
          numTokens,
        ),
    ).to.be.revertedWith('ERC20: transfer to the zero address');
  });

  it(`Can't transfer tokens if burn amount exceeds balance`, async function () {
    const { addrs, snowToken } = await setup();
    const numTokens = startingBalance + 1;
    await snowToken.connect(addrs[1])[`approve(address,uint256)`](addrs[3].address, numTokens);
    await expect(
      snowToken
        .connect(addrs[3])
        ['transferFrom(uint256,address,address,uint256)'](
          PROJECT_ID,
          addrs[1].address,
          addrs[2].address,
          numTokens,
        ),
    ).to.be.revertedWith('ERC20: transfer amount exceeds balance');
  });
});
