import { expect } from 'chai';
import { ethers } from 'hardhat';
import { deployMockContract } from '@ethereum-waffle/mock-contract';
import { impersonateAccount } from '../helpers/utils';
import errors from '../helpers/errors.json';

import JbController from '../../artifacts/contracts/SNOWController.sol/SNOWController.json';
import snowDirectory from '../../artifacts/contracts/SNOWDirectory.sol/SNOWDirectory.json';
import snowFundingCycleStore from '../../artifacts/contracts/SNOWFundingCycleStore.sol/SNOWFundingCycleStore.json';
import snowOperatoreStore from '../../artifacts/contracts/SNOWOperatorStore.sol/SNOWOperatorStore.json';
import snowProjects from '../../artifacts/contracts/SNOWProjects.sol/SNOWProjects.json';
import snowSplitsStore from '../../artifacts/contracts/SNOWSplitsStore.sol/SNOWSplitsStore.json';
import snowTokenStore from '../../artifacts/contracts/SNOWTokenStore.sol/SNOWTokenStore.json';

describe('SNOWController::prepForMigrationOf(...)', function () {
  const PROJECT_ID = 1;
  const TOTAL_SUPPLY = 20000;

  async function setup() {
    let [deployer, projectOwner, ...addrs] = await ethers.getSigners();

    let [
      mockJbController,
      mockJbDirectory,
      mockJbFundingCycleStore,
      mockJbOperatorStore,
      mockJbProjects,
      mockJbSplitsStore,
      mockJbTokenStore,
    ] = await Promise.all([
      deployMockContract(deployer, JbController.abi),
      deployMockContract(deployer, snowDirectory.abi),
      deployMockContract(deployer, snowFundingCycleStore.abi),
      deployMockContract(deployer, snowOperatoreStore.abi),
      deployMockContract(deployer, snowProjects.abi),
      deployMockContract(deployer, snowSplitsStore.abi),
      deployMockContract(deployer, snowTokenStore.abi),
    ]);

    let snowControllerFactory = await ethers.getContractFactory(
      'contracts/SNOWController.sol:SNOWController',
    );
    let snowController = await snowControllerFactory.deploy(
      mockJbOperatorStore.address,
      mockJbProjects.address,
      mockJbDirectory.address,
      mockJbFundingCycleStore.address,
      mockJbTokenStore.address,
      mockJbSplitsStore.address,
    );

    await mockJbProjects.mock.ownerOf.withArgs(PROJECT_ID).returns(projectOwner.address);

    await mockJbDirectory.mock.controllerOf.withArgs(PROJECT_ID).returns(mockJbController.address);

    await mockJbTokenStore.mock.totalSupplyOf.withArgs(PROJECT_ID).returns(TOTAL_SUPPLY);

    return {
      projectOwner,
      addrs,
      snowController,
      mockJbDirectory,
      mockJbTokenStore,
      mockJbController,
    };
  }

  it(`Should set the processed token tracker as the total supply if caller is not project's current controller`, async function () {
    const { snowController } = await setup();
    let controllerSigner = await impersonateAccount(snowController.address);

    const tx = snowController
      .connect(controllerSigner)
      .prepForMigrationOf(PROJECT_ID, ethers.constants.AddressZero);

    await expect(tx).to.be.not.reverted;

    // reserved token balance should be at 0 if processed token = total supply
    expect(await snowController.reservedTokenBalanceOf(PROJECT_ID, 10000)).to.equal(0);
    await expect(tx)
      .to.emit(snowController, 'PrepMigration')
      .withArgs(PROJECT_ID, ethers.constants.AddressZero, controllerSigner.address);
  });

  it(`Can't prep for migration if the caller is the current controller`, async function () {
    const { snowController, mockJbController, mockJbDirectory } = await setup();
    let controllerSigner = await impersonateAccount(mockJbController.address);

    await mockJbDirectory.mock.controllerOf.withArgs(PROJECT_ID).returns(snowController.address);

    await expect(
      snowController
        .connect(controllerSigner)
        .prepForMigrationOf(PROJECT_ID, ethers.constants.AddressZero),
    ).to.be.revertedWith(errors.CANT_MIGRATE_TO_CURRENT_CONTROLLER);
  });
});
