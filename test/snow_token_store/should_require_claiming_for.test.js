import { expect } from 'chai';
import { ethers } from 'hardhat';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import snowDirectory from '../../artifacts/contracts/SNOWDirectory.sol/SNOWDirectory.json';
import snowOperatoreStore from '../../artifacts/contracts/SNOWOperatorStore.sol/SNOWOperatorStore.json';
import snowProjects from '../../artifacts/contracts/SNOWProjects.sol/SNOWProjects.json';
import errors from '../helpers/errors.json';

describe('SNOWTokenStore::shouldRequireClaimingFor(...)', function () {
  const PROJECT_ID = 2;
  const TOKEN_NAME = 'TestTokenDAO';
  const TOKEN_SYMBOL = 'TEST';

  async function setup() {
    const [deployer, controller, projectOwner, holder, recipient] = await ethers.getSigners();

    const snowOperationsFactory = await ethers.getContractFactory('SNOWOperations');
    const snowOperations = await snowOperationsFactory.deploy();

    const REQUIRE_CLAIM_INDEX = await snowOperations.REQUIRE_CLAIM();

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
      projectOwner,
      holder,
      recipient,
      mockJbDirectory,
      mockJbOperatorStore,
      mockJbProjects,
      snowTokenStore,
      REQUIRE_CLAIM_INDEX,
    };
  }

  it('Should set flag and emit event if caller is project owner', async function () {
    const { controller, projectOwner, mockJbDirectory, mockJbProjects, snowTokenStore } =
      await setup();

    await mockJbDirectory.mock.controllerOf.withArgs(PROJECT_ID).returns(controller.address);
    await mockJbProjects.mock.ownerOf.withArgs(PROJECT_ID).returns(projectOwner.address);

    // Issue token for project
    await snowTokenStore.connect(controller).issueFor(PROJECT_ID, TOKEN_NAME, TOKEN_SYMBOL);

    // Set flag value
    const flagVal = true;
    const shouldRequireClaimingForTx = await snowTokenStore
      .connect(projectOwner)
      .shouldRequireClaimingFor(PROJECT_ID, flagVal);

    expect(await snowTokenStore.requireClaimFor(PROJECT_ID)).to.equal(flagVal);

    await expect(shouldRequireClaimingForTx)
      .to.emit(snowTokenStore, 'ShouldRequireClaim')
      .withArgs(PROJECT_ID, flagVal, projectOwner.address);
  });

  it('Should set flag and emit event if caller has permission', async function () {
    const {
      controller,
      projectOwner,
      holder,
      mockJbDirectory,
      mockJbOperatorStore,
      mockJbProjects,
      snowTokenStore,
      REQUIRE_CLAIM_INDEX,
    } = await setup();

    await mockJbDirectory.mock.controllerOf.withArgs(PROJECT_ID).returns(controller.address);

    await mockJbProjects.mock.ownerOf.withArgs(PROJECT_ID).returns(projectOwner.address);
    await mockJbOperatorStore.mock.hasPermission
      .withArgs(holder.address, projectOwner.address, PROJECT_ID, REQUIRE_CLAIM_INDEX)
      .returns(true);

    // Issue token for project
    await snowTokenStore.connect(controller).issueFor(PROJECT_ID, TOKEN_NAME, TOKEN_SYMBOL);

    // Set flag value
    const flagVal = true;
    const shouldRequireClaimingForTx = await snowTokenStore
      .connect(holder)
      .shouldRequireClaimingFor(PROJECT_ID, flagVal);

    expect(await snowTokenStore.requireClaimFor(PROJECT_ID)).to.equal(flagVal);

    await expect(shouldRequireClaimingForTx)
      .to.emit(snowTokenStore, 'ShouldRequireClaim')
      .withArgs(PROJECT_ID, flagVal, holder.address);
  });

  it(`Can't set flag if token doesn't exist for project`, async function () {
    const {
      controller,
      holder,
      mockJbOperatorStore,
      mockJbProjects,
      snowTokenStore,
      REQUIRE_CLAIM_INDEX,
    } = await setup();

    await mockJbProjects.mock.ownerOf.withArgs(PROJECT_ID).returns(controller.address);
    await mockJbOperatorStore.mock.hasPermission
      .withArgs(controller.address, holder.address, PROJECT_ID, REQUIRE_CLAIM_INDEX)
      .returns(true);

    await expect(
      snowTokenStore.connect(controller).shouldRequireClaimingFor(PROJECT_ID, /* flag= */ true),
    ).to.be.revertedWith(errors.TOKEN_NOT_FOUND);
  });

  it(`Can't set flag if caller lacks permission`, async function () {
    const {
      projectOwner,
      holder,
      mockJbOperatorStore,
      mockJbProjects,
      snowTokenStore,
      REQUIRE_CLAIM_INDEX,
    } = await setup();

    await mockJbProjects.mock.ownerOf.withArgs(PROJECT_ID).returns(projectOwner.address);
    await mockJbOperatorStore.mock.hasPermission
      .withArgs(holder.address, projectOwner.address, PROJECT_ID, REQUIRE_CLAIM_INDEX)
      .returns(false);

    await mockJbOperatorStore.mock.hasPermission
      .withArgs(holder.address, projectOwner.address, 0, REQUIRE_CLAIM_INDEX)
      .returns(false);

    await expect(
      snowTokenStore.connect(holder).shouldRequireClaimingFor(PROJECT_ID, /* flag= */ false),
    ).to.be.revertedWith(errors.UNAUTHORIZED);
  });
});
