import { expect } from 'chai';
import { ethers } from 'hardhat';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import snowDirectory from '../../artifacts/contracts/SNOWDirectory.sol/SNOWDirectory.json';
import snowOperatoreStore from '../../artifacts/contracts/SNOWOperatorStore.sol/SNOWOperatorStore.json';
import snowProjects from '../../artifacts/contracts/SNOWProjects.sol/SNOWProjects.json';
import errors from '../helpers/errors.json';

describe('SNOWTokenStore::claimFor(...)', function () {
  const PROJECT_ID = 2;
  const TOKEN_NAME = 'TestTokenDAO';
  const TOKEN_SYMBOL = 'TEST';

  async function setup() {
    const [deployer, controller, newHolder, projectOwner] = await ethers.getSigners();

    const mockJbOperatorStore = await deployMockContract(deployer, snowOperatoreStore.abi);
    const mockJbProjects = await deployMockContract(deployer, snowProjects.abi);
    const mockJbDirectory = await deployMockContract(deployer, snowDirectory.abi);

    const snowOperationsFactory = await ethers.getContractFactory('SNOWOperations');
    const snowOperations = await snowOperationsFactory.deploy();

    const CLAIM_INDEX = await snowOperations.CLAIM();

    const snowTokenStoreFactory = await ethers.getContractFactory('SNOWTokenStore');
    const snowTokenStore = await snowTokenStoreFactory.deploy(
      mockJbOperatorStore.address,
      mockJbProjects.address,
      mockJbDirectory.address,
    );

    await mockJbProjects.mock.ownerOf.withArgs(PROJECT_ID).returns(projectOwner.address);

    return {
      controller,
      newHolder,
      projectOwner,
      mockJbDirectory,
      mockJbProjects,
      mockJbOperatorStore,
      snowTokenStore,
      CLAIM_INDEX,
    };
  }

  it('Should claim tokens and emit event', async function () {
    const {
      controller,
      newHolder,
      mockJbDirectory,
      mockJbOperatorStore,
      snowTokenStore,
      CLAIM_INDEX,
    } = await setup();

    await mockJbDirectory.mock.controllerOf.withArgs(PROJECT_ID).returns(controller.address);

    await snowTokenStore.connect(controller).issueFor(PROJECT_ID, TOKEN_NAME, TOKEN_SYMBOL);
    await mockJbOperatorStore.mock.hasPermission
      .withArgs(controller.address, newHolder.address, PROJECT_ID, CLAIM_INDEX)
      .returns(true);

    // Mint more unclaimed tokens
    const numTokens = 20;
    await snowTokenStore
      .connect(controller)
      .mintFor(newHolder.address, PROJECT_ID, numTokens, /* preferClaimedTokens= */ false);

    const amountToClaim = numTokens - 1;

    // Claim the unclaimed tokens
    const claimForTx = await snowTokenStore
      .connect(controller)
      .claimFor(newHolder.address, PROJECT_ID, amountToClaim);

    expect(await snowTokenStore.unclaimedBalanceOf(newHolder.address, PROJECT_ID)).to.equal(
      numTokens - amountToClaim,
    );
    expect(await snowTokenStore.balanceOf(newHolder.address, PROJECT_ID)).to.equal(numTokens);
    expect(await snowTokenStore.totalSupplyOf(PROJECT_ID)).to.equal(numTokens);

    await expect(claimForTx)
      .to.emit(snowTokenStore, 'Claim')
      .withArgs(newHolder.address, PROJECT_ID, numTokens, amountToClaim, controller.address);
  });
  it(`Can't claim tokens if projectId isn't found`, async function () {
    const { newHolder, snowTokenStore } = await setup();
    const numTokens = 1;

    await expect(
      snowTokenStore.connect(newHolder).claimFor(newHolder.address, PROJECT_ID, numTokens),
    ).to.be.revertedWith(errors.TOKEN_NOT_FOUND);
  });

  it(`Can't claim more tokens than the current _unclaimedBalance`, async function () {
    const { controller, newHolder, mockJbDirectory, snowTokenStore, CLAIM_INDEX } = await setup();

    await mockJbDirectory.mock.controllerOf.withArgs(PROJECT_ID).returns(controller.address);

    await snowTokenStore.connect(controller).issueFor(PROJECT_ID, TOKEN_NAME, TOKEN_SYMBOL);

    // Mint more unclaimed tokens
    const numTokens = 10000;
    await snowTokenStore
      .connect(controller)
      .mintFor(newHolder.address, PROJECT_ID, numTokens, /* preferClaimedTokens= */ false);

    await expect(
      snowTokenStore.connect(newHolder).claimFor(newHolder.address, PROJECT_ID, numTokens + 1),
    ).to.be.revertedWith(errors.INSUFFICIENT_UNCLAIMED_TOKENS);
  });
  it(`Can't claim unclaimed tokens if caller lacks permission`, async function () {
    const { controller, newHolder, snowTokenStore } = await setup();

    await expect(
      snowTokenStore
        .connect(controller)
        .claimFor(/* holder */ newHolder.address, PROJECT_ID, /* amount= */ 1),
    ).to.be.reverted;
  });
});
