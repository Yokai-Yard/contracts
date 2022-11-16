import { expect } from 'chai';
import { ethers } from 'hardhat';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import snowDirectory from '../../artifacts/contracts/SNOWDirectory.sol/SNOWDirectory.json';
import snowOperatoreStore from '../../artifacts/contracts/SNOWOperatorStore.sol/SNOWOperatorStore.json';
import snowProjects from '../../artifacts/contracts/SNOWProjects.sol/SNOWProjects.json';
import snowToken from '../../artifacts/contracts/SNOWToken.sol/SNOWToken.json';
import { Contract } from 'ethers';
import errors from '../helpers/errors.json';

describe('SNOWTokenStore::issueFor(...)', function () {
  const PROJECT_ID = 2;
  const TOKEN_NAME = 'TestTokenDAO';
  const TOKEN_SYMBOL = 'TEST';

  async function setup() {
    const [deployer, controller] = await ethers.getSigners();

    const mockJbOperatorStore = await deployMockContract(deployer, snowOperatoreStore.abi);
    const mockJbProjects = await deployMockContract(deployer, snowProjects.abi);
    const mockJbDirectory = await deployMockContract(deployer, snowDirectory.abi);

    const snowTokenStoreFactory = await ethers.getContractFactory('SNOWTokenStore');
    const snowTokenStore = await snowTokenStoreFactory.deploy(
      mockJbOperatorStore.address,
      mockJbProjects.address,
      mockJbDirectory.address,
    );

    return {
      controller,
      mockJbDirectory,
      snowTokenStore,
    };
  }

  it('Should issue tokens and emit event if caller is controller', async function () {
    const { controller, mockJbDirectory, snowTokenStore } = await setup();

    await mockJbDirectory.mock.controllerOf.withArgs(PROJECT_ID).returns(controller.address);

    const tx = await snowTokenStore
      .connect(controller)
      .issueFor(PROJECT_ID, TOKEN_NAME, TOKEN_SYMBOL);

    const tokenAddr = await snowTokenStore.connect(controller).tokenOf(PROJECT_ID);
    const token = new Contract(tokenAddr, snowToken.abi);

    expect(await snowTokenStore.projectOf(tokenAddr)).to.equal(PROJECT_ID);

    expect(await token.connect(controller).name()).to.equal(TOKEN_NAME);
    expect(await token.connect(controller).symbol()).to.equal(TOKEN_SYMBOL);

    await expect(tx)
      .to.emit(snowTokenStore, 'Issue')
      .withArgs(PROJECT_ID, tokenAddr, TOKEN_NAME, TOKEN_SYMBOL, controller.address);
  });

  it(`Can't issue tokens if name is empty`, async function () {
    const { controller, mockJbDirectory, snowTokenStore } = await setup();

    await mockJbDirectory.mock.controllerOf.withArgs(PROJECT_ID).returns(controller.address);

    const name = '';
    await expect(
      snowTokenStore.connect(controller).issueFor(PROJECT_ID, name, TOKEN_SYMBOL),
    ).to.be.revertedWith(errors.EMPTY_NAME);
  });

  it(`Can't issue tokens if symbol is empty`, async function () {
    const { controller, mockJbDirectory, snowTokenStore } = await setup();

    await mockJbDirectory.mock.controllerOf.withArgs(PROJECT_ID).returns(controller.address);

    const symbol = '';
    await expect(
      snowTokenStore.connect(controller).issueFor(PROJECT_ID, TOKEN_NAME, symbol),
    ).to.be.revertedWith(errors.EMPTY_SYMBOL);
  });

  it(`Can't issue tokens if already issued`, async function () {
    const { controller, mockJbDirectory, snowTokenStore } = await setup();

    await mockJbDirectory.mock.controllerOf.withArgs(PROJECT_ID).returns(controller.address);

    // First issuance should succeed; second should fail.
    await expect(snowTokenStore.connect(controller).issueFor(PROJECT_ID, TOKEN_NAME, TOKEN_SYMBOL)).to
      .not.be.reverted;
    await expect(
      snowTokenStore.connect(controller).issueFor(PROJECT_ID, TOKEN_NAME, TOKEN_SYMBOL),
    ).to.be.revertedWith(errors.PROJECT_ALREADY_HAS_TOKEN);
  });

  it(`Can't issue tokens if caller does not have permission`, async function () {
    const { controller, mockJbDirectory, snowTokenStore } = await setup();

    // Return a random controller address.
    await mockJbDirectory.mock.controllerOf
      .withArgs(PROJECT_ID)
      .returns(ethers.Wallet.createRandom().address);

    await expect(
      snowTokenStore.connect(controller).issueFor(PROJECT_ID, TOKEN_NAME, TOKEN_SYMBOL),
    ).to.be.revertedWith(errors.CONTROLLER_UNAUTHORIZED);
  });
});
