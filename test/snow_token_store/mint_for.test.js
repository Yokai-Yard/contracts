import { expect } from 'chai';
import { ethers } from 'hardhat';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import snowDirectory from '../../artifacts/contracts/SNOWDirectory.sol/SNOWDirectory.json';
import snowOperatoreStore from '../../artifacts/contracts/SNOWOperatorStore.sol/SNOWOperatorStore.json';
import snowProjects from '../../artifacts/contracts/SNOWProjects.sol/SNOWProjects.json';
import errors from '../helpers/errors.json';

describe('SNOWTokenStore::mintFor(...)', function () {
  const PROJECT_ID = 2;
  const TOKEN_NAME = 'TestTokenDAO';
  const TOKEN_SYMBOL = 'TEST';

  async function setup() {
    const [deployer, controller, newHolder] = await ethers.getSigners();

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
      newHolder,
      mockJbDirectory,
      snowTokenStore,
    };
  }

  it('Should mint claimed tokens and emit event if caller is controller', async function () {
    const { controller, newHolder, mockJbDirectory, snowTokenStore } = await setup();

    await mockJbDirectory.mock.controllerOf.withArgs(PROJECT_ID).returns(controller.address);

    await snowTokenStore.connect(controller).issueFor(PROJECT_ID, TOKEN_NAME, TOKEN_SYMBOL);

    // Mint more claimed tokens
    const numTokens = 20;
    const mintForTx = await snowTokenStore
      .connect(controller)
      .mintFor(newHolder.address, PROJECT_ID, numTokens, /* preferClaimedTokens= */ true);

    expect(await snowTokenStore.unclaimedBalanceOf(newHolder.address, PROJECT_ID)).to.equal(0);
    expect(await snowTokenStore.balanceOf(newHolder.address, PROJECT_ID)).to.equal(numTokens);

    await expect(mintForTx)
      .to.emit(snowTokenStore, 'Mint')
      .withArgs(
        newHolder.address,
        PROJECT_ID,
        numTokens,
        /* shouldClaimTokens= */ true,
        /* preferClaimedTokens= */ true,
        controller.address,
      );
  });

  it('Should mint unclaimed tokens and emit event if caller is controller', async function () {
    const { controller, newHolder, mockJbDirectory, snowTokenStore } = await setup();

    await mockJbDirectory.mock.controllerOf.withArgs(PROJECT_ID).returns(controller.address);

    await snowTokenStore.connect(controller).issueFor(PROJECT_ID, TOKEN_NAME, TOKEN_SYMBOL);

    // Mint more unclaimed tokens
    const numTokens = 20;
    const mintForTx = await snowTokenStore
      .connect(controller)
      .mintFor(newHolder.address, PROJECT_ID, numTokens, /* preferClaimedTokens= */ false);

    expect(await snowTokenStore.unclaimedBalanceOf(newHolder.address, PROJECT_ID)).to.equal(
      numTokens,
    );
    expect(await snowTokenStore.balanceOf(newHolder.address, PROJECT_ID)).to.equal(numTokens);

    await expect(mintForTx)
      .to.emit(snowTokenStore, 'Mint')
      .withArgs(
        newHolder.address,
        PROJECT_ID,
        numTokens,
        /* shouldClaimTokens= */ false,
        /* preferClaimedTokens= */ false,
        controller.address,
      );
  });

  it(`Can't mint tokens if caller does not have permission`, async function () {
    const { newHolder, mockJbDirectory, snowTokenStore } = await setup();

    // Return a random controller address.
    await mockJbDirectory.mock.controllerOf
      .withArgs(PROJECT_ID)
      .returns(ethers.Wallet.createRandom().address);

    await expect(
      snowTokenStore.mintFor(
        newHolder.address,
        PROJECT_ID,
        /* amount= */ 1,
        /* preferClaimedTokens= */ true,
      ),
    ).to.be.revertedWith(errors.CONTROLLER_UNAUTHORIZED);
  });
});
