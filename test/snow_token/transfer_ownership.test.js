import { expect } from 'chai';
import { ethers } from 'hardhat';
import { deployJbToken } from '../helpers/utils';

describe('SNOWToken::transferOwnership(...)', function () {
  const name = 'TestTokenDAO';
  const symbol = 'TEST';
  const projectIdDoesntMatter = 123;

  async function setup() {
    const [deployer, ...addrs] = await ethers.getSigners();
    const snowToken = await deployJbToken(name, symbol);
    return { deployer, addrs, snowToken };
  }

  it('Should transfer ownership to another address if caller is owner', async function () {
    const { deployer, addrs, snowToken } = await setup();
    const newAddr = addrs[0];

    const transferOwnershipTx = await snowToken
      .connect(deployer)
      ['transferOwnership(uint256,address)'](projectIdDoesntMatter, newAddr.address);

    await expect(transferOwnershipTx)
      .to.emit(snowToken, 'OwnershipTransferred')
      .withArgs(deployer.address, newAddr.address);

    expect(await snowToken.owner()).to.equal(newAddr.address);
  });

  it(`Can't transfer ownership if caller isn't owner`, async function () {
    const { addrs, snowToken } = await setup();
    const newAddr = addrs[0];
    const nonOwner = addrs[1];
    await expect(
      snowToken
        .connect(nonOwner)
        ['transferOwnership(uint256,address)'](projectIdDoesntMatter, newAddr.address),
    ).to.be.revertedWith('Ownable: caller is not the owner');
  });

  it(`Can't set new owner to zero address`, async function () {
    const { snowToken } = await setup();
    await expect(
      snowToken['transferOwnership(uint256,address)'](
        projectIdDoesntMatter,
        ethers.constants.AddressZero,
      ),
    ).to.be.revertedWith('Ownable: new owner is the zero address');
  });
});
