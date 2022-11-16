import { expect } from 'chai';
import { ethers } from 'hardhat';
import { deployMockContract } from '@ethereum-waffle/mock-contract';
import { packFundingCycleMetadata, makeSplits } from '../helpers/utils';

import snowAllocator from '../../artifacts/contracts/interfaces/ISNOWSplitAllocator.sol/ISNOWSplitAllocator.json';
import snowDirectory from '../../artifacts/contracts/SNOWDirectory.sol/SNOWDirectory.json';
import snowFundingCycleStore from '../../artifacts/contracts/SNOWFundingCycleStore.sol/SNOWFundingCycleStore.json';
import snowOperatoreStore from '../../artifacts/contracts/SNOWOperatorStore.sol/SNOWOperatorStore.json';
import snowProjects from '../../artifacts/contracts/SNOWProjects.sol/SNOWProjects.json';
import snowSplitsStore from '../../artifacts/contracts/SNOWSplitsStore.sol/SNOWSplitsStore.json';
import snowToken from '../../artifacts/contracts/SNOWToken.sol/SNOWToken.json';
import snowTokenStore from '../../artifacts/contracts/SNOWTokenStore.sol/SNOWTokenStore.json';

describe('SNOWController::totalOutstandingTokensOf(...)', function () {
  const PROJECT_ID = 1;
  const MEMO = 'Test Memo';
  const RESERVED_AMOUNT = 20000;
  const ALREADY_MINTED_TOKEN = 1000;
  const PREFERED_CLAIMED_TOKEN = true;
  const RESERVED_RATE = 10000;

  let MINT_INDEX;
  let RESERVED_SPLITS_GROUP;

  before(async function () {
    let snowOperationsFactory = await ethers.getContractFactory('SNOWOperations');
    let snowOperations = await snowOperationsFactory.deploy();
    MINT_INDEX = await snowOperations.MINT();

    let snowSplitsGroupsFactory = await ethers.getContractFactory('SNOWSplitsGroups');
    let snowSplitsGroups = await snowSplitsGroupsFactory.deploy();
    RESERVED_SPLITS_GROUP = await snowSplitsGroups.RESERVED_TOKENS();
  });

  async function setup() {
    let [deployer, projectOwner, ...addrs] = await ethers.getSigners();

    const blockNum = await ethers.provider.getBlockNumber();
    const block = await ethers.provider.getBlock(blockNum);
    const timestamp = block.timestamp;

    let [
      mockJbDirectory,
      mockJbFundingCycleStore,
      mockJbOperatorStore,
      mockJbProjects,
      mockSplitsStore,
      mockJbToken,
      mockJbTokenStore,
    ] = await Promise.all([
      deployMockContract(deployer, snowDirectory.abi),
      deployMockContract(deployer, snowFundingCycleStore.abi),
      deployMockContract(deployer, snowOperatoreStore.abi),
      deployMockContract(deployer, snowProjects.abi),
      deployMockContract(deployer, snowSplitsStore.abi),
      deployMockContract(deployer, snowToken.abi),
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
      mockSplitsStore.address,
    );

    await mockJbProjects.mock.ownerOf.withArgs(PROJECT_ID).returns(projectOwner.address);
    await mockJbDirectory.mock.isTerminalOf
      .withArgs(PROJECT_ID, projectOwner.address)
      .returns(false);
    await mockJbTokenStore.mock.totalSupplyOf.withArgs(PROJECT_ID).returns(ALREADY_MINTED_TOKEN);

    return {
      projectOwner,
      addrs,
      snowController,
      mockJbOperatorStore,
      mockJbDirectory,
      mockJbFundingCycleStore,
      mockJbTokenStore,
      mockJbToken,
      mockSplitsStore,
      mockJbProjects,
      timestamp,
    };
  }

  it(`Should return the total amount of outstanding token, when the reserve rate is maximum`, async function () {
    const { snowController, timestamp, projectOwner, mockJbFundingCycleStore, mockJbTokenStore } =
      await setup();

    await mockJbFundingCycleStore.mock.currentOf.withArgs(PROJECT_ID).returns({
      number: 1,
      configuration: timestamp,
      basedOn: timestamp,
      start: timestamp,
      duration: 0,
      weight: 0,
      discountRate: 0,
      ballot: ethers.constants.AddressZero,
      metadata: packFundingCycleMetadata({ reservedRate: RESERVED_RATE, allowMinting: true }),
    }),
      await mockJbTokenStore.mock.mintFor
        .withArgs(ethers.constants.AddressZero, PROJECT_ID, RESERVED_AMOUNT, true)
        .returns();

    await snowController
      .connect(projectOwner)
      .mintTokensOf(
        PROJECT_ID,
        RESERVED_AMOUNT,
        ethers.constants.AddressZero,
        MEMO,
        PREFERED_CLAIMED_TOKEN,
        /*useReservedRate*/ true,
      );

    expect(await snowController.totalOutstandingTokensOf(PROJECT_ID, RESERVED_RATE)).to.equal(
      RESERVED_AMOUNT + ALREADY_MINTED_TOKEN + ALREADY_MINTED_TOKEN,
    ); //unprocessed + total supply
  });

  it(`Should return the total amount of outstanding token, when the reserve rate is less than the maximum`, async function () {
    const { snowController, projectOwner, timestamp, mockJbFundingCycleStore, mockJbTokenStore } =
      await setup();

    await mockJbFundingCycleStore.mock.currentOf.withArgs(PROJECT_ID).returns({
      number: 1,
      configuration: timestamp,
      basedOn: timestamp,
      start: timestamp,
      duration: 0,
      weight: 0,
      discountRate: 0,
      ballot: ethers.constants.AddressZero,
      metadata: packFundingCycleMetadata({ reservedRate: 5000, allowMinting: true }),
    });

    // 50% reserved rate
    await mockJbTokenStore.mock.mintFor
      .withArgs(ethers.constants.AddressZero, PROJECT_ID, RESERVED_AMOUNT / 2, true)
      .returns();

    await snowController
      .connect(projectOwner)
      .mintTokensOf(
        PROJECT_ID,
        RESERVED_AMOUNT,
        ethers.constants.AddressZero,
        MEMO,
        PREFERED_CLAIMED_TOKEN,
        /*useReservedRate*/ true,
      );

    expect(await snowController.totalOutstandingTokensOf(PROJECT_ID, 5000)).to.equal(
      ALREADY_MINTED_TOKEN + ((ALREADY_MINTED_TOKEN * 10000) / (10000 - 5000) - 1000),
    );
    // total supply + reserved unprocessed token which is  [minted * 1/(1-reserved rate)] - minted
  });

  it(`Should return the total amount of outstanding token equals to the total supply, when the reserve rate is 0`, async function () {
    const { snowController, projectOwner, timestamp, mockJbFundingCycleStore, mockJbTokenStore } =
      await setup();

    await mockJbFundingCycleStore.mock.currentOf.withArgs(PROJECT_ID).returns({
      number: 1,
      configuration: timestamp,
      basedOn: timestamp,
      start: timestamp,
      duration: 0,
      weight: 0,
      discountRate: 0,
      ballot: ethers.constants.AddressZero,
      metadata: packFundingCycleMetadata({ reservedRate: 0, allowMinting: 1 }),
    });

    await mockJbTokenStore.mock.mintFor
      .withArgs(ethers.constants.AddressZero, PROJECT_ID, ALREADY_MINTED_TOKEN, true)
      .returns();

    await snowController
      .connect(projectOwner)
      .mintTokensOf(
        PROJECT_ID,
        ALREADY_MINTED_TOKEN,
        ethers.constants.AddressZero,
        MEMO,
        PREFERED_CLAIMED_TOKEN,
        /*useReservedRate*/ true,
      );

    expect(await snowController.totalOutstandingTokensOf(PROJECT_ID, 0)).to.equal(
      ALREADY_MINTED_TOKEN,
    );
  });
});
