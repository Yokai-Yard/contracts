import { expect } from 'chai';
import { ethers } from 'hardhat';
import { deployMockContract } from '@ethereum-waffle/mock-contract';
import { makeSplits, packFundingCycleMetadata } from '../helpers/utils';
import errors from '../helpers/errors.json';

import JbController from '../../artifacts/contracts/SNOWController.sol/SNOWController.json';
import snowDirectory from '../../artifacts/contracts/SNOWDirectory.sol/SNOWDirectory.json';
import snowFundingCycleStore from '../../artifacts/contracts/SNOWFundingCycleStore.sol/SNOWFundingCycleStore.json';
import snowOperatoreStore from '../../artifacts/contracts/SNOWOperatorStore.sol/SNOWOperatorStore.json';
import snowProjects from '../../artifacts/contracts/SNOWProjects.sol/SNOWProjects.json';
import snowSplitsStore from '../../artifacts/contracts/SNOWSplitsStore.sol/SNOWSplitsStore.json';
import snowTerminal from '../../artifacts/contracts/SNOWETHPaymentTerminal.sol/SNOWETHPaymentTerminal.json';
import snowTokenStore from '../../artifacts/contracts/SNOWTokenStore.sol/SNOWTokenStore.json';

describe('SNOWController::launchFundingCyclesFor(...)', function () {
  const EXISTING_PROJECT = 1;
  const LAUNCHED_PROJECT = 2;
  const NONEXISTANT_PROJECT = 3;
  const METADATA_CID = '';
  const METADATA_DOMAIN = 1234;
  const MEMO = 'Test Memo';
  const PROJECT_START = '1';
  let RECONFIGURE_INDEX;
  let MIGRATE_CONTROLLER_INDEX;

  before(async function () {
    let snowOperationsFactory = await ethers.getContractFactory('SNOWOperations');
    let snowOperations = await snowOperationsFactory.deploy();

    RECONFIGURE_INDEX = await snowOperations.RECONFIGURE();
    MIGRATE_CONTROLLER_INDEX = await snowOperations.MIGRATE_CONTROLLER();
  });

  async function setup() {
    let [deployer, projectOwner, nonOwner, ...addrs] = await ethers.getSigners();

    const blockNum = await ethers.provider.getBlockNumber();
    const block = await ethers.provider.getBlock(blockNum);
    const timestamp = block.timestamp;
    const fundingCycleData = makeFundingCycleDataStruct();
    const fundingCycleMetadata = makeFundingCycleMetadata();
    const splits = makeSplits();

    let [
      mockJbController,
      mockJbDirectory,
      mockJbFundingCycleStore,
      mockJbOperatorStore,
      mockJbProjects,
      mockJbSplitsStore,
      mockJbTerminal1,
      mockJbTerminal2,
      mockJbTokenStore,
    ] = await Promise.all([
      deployMockContract(deployer, JbController.abi),
      deployMockContract(deployer, snowDirectory.abi),
      deployMockContract(deployer, snowFundingCycleStore.abi),
      deployMockContract(deployer, snowOperatoreStore.abi),
      deployMockContract(deployer, snowProjects.abi),
      deployMockContract(deployer, snowSplitsStore.abi),
      deployMockContract(deployer, snowTerminal.abi),
      deployMockContract(deployer, snowTerminal.abi),
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

    await mockJbProjects.mock.createFor
      .withArgs(projectOwner.address, [METADATA_CID, METADATA_DOMAIN])
      .returns(EXISTING_PROJECT);

    await mockJbProjects.mock.ownerOf.withArgs(EXISTING_PROJECT).returns(projectOwner.address);

    await mockJbProjects.mock.ownerOf.withArgs(LAUNCHED_PROJECT).returns(projectOwner.address);

    await mockJbProjects.mock.ownerOf.withArgs(NONEXISTANT_PROJECT).reverts();

    await mockJbDirectory.mock.setControllerOf
      .withArgs(EXISTING_PROJECT, snowController.address)
      .returns();

    await mockJbDirectory.mock.setTerminalsOf
      .withArgs(EXISTING_PROJECT, [mockJbTerminal1.address, mockJbTerminal2.address])
      .returns();

    await mockJbFundingCycleStore.mock.configureFor
      .withArgs(EXISTING_PROJECT, fundingCycleData, fundingCycleMetadata.packed, PROJECT_START)
      .returns(
        Object.assign(
          {
            number: EXISTING_PROJECT,
            configuration: timestamp,
            basedOn: timestamp,
            start: timestamp,
            metadata: fundingCycleMetadata.packed,
          },
          fundingCycleData,
        ),
      );

    await mockJbFundingCycleStore.mock.latestConfigurationOf.withArgs(EXISTING_PROJECT).returns(0);

    await mockJbFundingCycleStore.mock.latestConfigurationOf.withArgs(LAUNCHED_PROJECT).returns(1);

    const groupedSplits = [{ group: 1, splits }];

    await mockJbSplitsStore.mock.set
      .withArgs(EXISTING_PROJECT, /*configuration=*/ timestamp, groupedSplits)
      .returns();

    return {
      deployer,
      projectOwner,
      nonOwner,
      addrs,
      snowController,
      mockJbDirectory,
      mockJbTokenStore,
      mockJbController,
      mockJbProjects,
      mockJbOperatorStore,
      mockJbFundingCycleStore,
      mockJbTerminal1,
      mockJbTerminal2,
      timestamp,
      fundingCycleData,
      fundingCycleMetadata,
      splits,
    };
  }

  function makeFundingCycleMetadata({
    reservedRate = 0,
    redemptionRate = 10000,
    ballotRedemptionRate = 10000,
    pausePay = false,
    pauseDistributions = false,
    pauseRedeem = false,
    pauseBurn = false,
    allowMinting = false,
    allowChangeToken = false,
    allowTerminalMigration = false,
    allowControllerMigration = false,
    allowSetTerminals = false,
    allowSetControllers = false,
    holdFees = false,
    useTotalOverflowForRedemptions = false,
    useDataSourceForPay = false,
    useDataSourceForRedeem = false,
    dataSource = ethers.constants.AddressZero,
  } = {}) {
    const unpackedMetadata = {
      global: {
        allowSetTerminals,
        allowSetControllers,
      },
      reservedRate,
      redemptionRate,
      ballotRedemptionRate,
      pausePay,
      pauseDistributions,
      pauseRedeem,
      pauseBurn,
      allowMinting,
      allowChangeToken,
      allowTerminalMigration,
      allowControllerMigration,
      holdFees,
      useTotalOverflowForRedemptions,
      useDataSourceForPay,
      useDataSourceForRedeem,
      dataSource,
    };
    return { unpacked: unpackedMetadata, packed: packFundingCycleMetadata(unpackedMetadata) };
  }

  function makeFundingCycleDataStruct({
    duration = 0,
    weight = ethers.BigNumber.from('1' + '0'.repeat(18)),
    discountRate = 900000000,
    ballot = ethers.constants.AddressZero,
  } = {}) {
    return { duration, weight, discountRate, ballot };
  }

  function makeFundingAccessConstraints({
    terminals,
    token = ethers.Wallet.createRandom().address,
    distributionLimit = 200,
    distributionLimitCurrency = 1,
    overflowAllowance = 100,
    overflowAllowanceCurrency = 2,
  } = {}) {
    let constraints = [];
    for (let terminal of terminals) {
      constraints.push({
        terminal,
        token,
        distributionLimit,
        distributionLimitCurrency,
        overflowAllowance,
        overflowAllowanceCurrency,
      });
    }
    return constraints;
  }

  it(`Should launch a funding cycle for an existing project and emit events`, async function () {
    const {
      snowController,
      projectOwner,
      timestamp,
      fundingCycleData,
      fundingCycleMetadata,
      splits,
      mockJbTerminal1,
      mockJbTerminal2,
    } = await setup();
    const groupedSplits = [{ group: 1, splits }];
    const terminals = [mockJbTerminal1.address, mockJbTerminal2.address];
    const token = ethers.Wallet.createRandom().address;
    const fundAccessConstraints = makeFundingAccessConstraints({ terminals, token });

    expect(
      await snowController
        .connect(projectOwner)
        .callStatic.launchFundingCyclesFor(
          EXISTING_PROJECT,
          fundingCycleData,
          fundingCycleMetadata.unpacked,
          PROJECT_START,
          groupedSplits,
          fundAccessConstraints,
          terminals,
          MEMO,
        ),
    ).to.equal(timestamp);

    let tx = snowController
      .connect(projectOwner)
      .launchFundingCyclesFor(
        EXISTING_PROJECT,
        fundingCycleData,
        fundingCycleMetadata.unpacked,
        PROJECT_START,
        groupedSplits,
        fundAccessConstraints,
        terminals,
        MEMO,
      );

    await Promise.all(
      fundAccessConstraints.map(async (constraints) => {
        await expect(tx)
          .to.emit(snowController, 'SetFundAccessConstraints')
          .withArgs(
            /*fundingCycleData.configuration=*/ timestamp,
            /*fundingCycleData.number=*/ 1,
            EXISTING_PROJECT,
            [
              constraints.terminal,
              constraints.token,
              constraints.distributionLimit,
              constraints.distributionLimitCurrency,
              constraints.overflowAllowance,
              constraints.overflowAllowanceCurrency,
            ],
            projectOwner.address,
          );

        const args = [EXISTING_PROJECT, timestamp, constraints.terminal, token];
        expect(await snowController.distributionLimitOf(...args)).deep.equals([
          ethers.BigNumber.from(constraints.distributionLimit),
          ethers.BigNumber.from(constraints.distributionLimitCurrency),
        ]);
        expect(await snowController.overflowAllowanceOf(...args)).deep.equals([
          ethers.BigNumber.from(constraints.overflowAllowance),
          ethers.BigNumber.from(constraints.overflowAllowanceCurrency),
        ]);
      }),
    );
    await expect(tx)
      .to.emit(snowController, 'LaunchFundingCycles')
      .withArgs(
        /*fundingCycleData.configuration=*/ timestamp,
        EXISTING_PROJECT,
        MEMO,
        projectOwner.address,
      );
  });

  it(`Should launch a funding cycle without payment terminals and funding cycle constraints`, async function () {
    const {
      snowController,
      projectOwner,
      timestamp,
      fundingCycleData,
      fundingCycleMetadata,
      splits,
    } = await setup();
    const groupedSplits = [{ group: 1, splits }];
    const fundAccessConstraints = [];

    expect(
      await snowController
        .connect(projectOwner)
        .callStatic.launchFundingCyclesFor(
          EXISTING_PROJECT,
          fundingCycleData,
          fundingCycleMetadata.unpacked,
          PROJECT_START,
          groupedSplits,
          fundAccessConstraints,
          [],
          MEMO,
        ),
    ).to.equal(timestamp);

    // No constraint => no event
    await expect(
      snowController
        .connect(projectOwner)
        .launchFundingCyclesFor(
          EXISTING_PROJECT,
          fundingCycleData,
          fundingCycleMetadata.unpacked,
          PROJECT_START,
          groupedSplits,
          fundAccessConstraints,
          [],
          MEMO,
        ),
    ).to.not.emit(snowController, 'SetFundAccessConstraints');
  });

  it(`Can't launch a project with a reserved rate superior to 10000`, async function () {
    const {
      snowController,
      projectOwner,
      fundingCycleData,
      splits,
      mockJbTerminal1,
      mockJbTerminal2,
    } = await setup();
    const groupedSplits = [{ group: 1, splits }];
    const terminals = [mockJbTerminal1.address, mockJbTerminal2.address];
    const fundAccessConstraints = makeFundingAccessConstraints({ terminals });
    const fundingCycleMetadata = makeFundingCycleMetadata({ reservedRate: 10001 });

    let tx = snowController
      .connect(projectOwner)
      .launchFundingCyclesFor(
        EXISTING_PROJECT,
        fundingCycleData,
        fundingCycleMetadata.unpacked,
        PROJECT_START,
        groupedSplits,
        fundAccessConstraints,
        terminals,
        MEMO,
      );

    await expect(tx).to.be.revertedWith(errors.INVALID_RESERVED_RATE);
  });

  it(`Can't launch a project with a redemption rate superior to 10000`, async function () {
    const {
      snowController,
      projectOwner,
      fundingCycleData,
      fundingCycleMetadata,
      splits,
      mockJbTerminal1,
      mockJbTerminal2,
    } = await setup();
    const groupedSplits = [{ group: 1, splits }];
    const terminals = [mockJbTerminal1.address, mockJbTerminal2.address];
    const fundAccessConstraints = makeFundingAccessConstraints({ terminals });

    fundingCycleMetadata.unpacked.redemptionRate = 10001; //not possible in packed metadata (shl of a negative value)

    let tx = snowController
      .connect(projectOwner)
      .launchFundingCyclesFor(
        EXISTING_PROJECT,
        fundingCycleData,
        fundingCycleMetadata.unpacked,
        PROJECT_START,
        groupedSplits,
        fundAccessConstraints,
        terminals,
        MEMO,
      );

    await expect(tx).to.be.revertedWith(errors.INVALID_REDEMPTION_RATE);
  });

  it(`Can't launch a project with a ballot redemption rate superior to 10000`, async function () {
    const {
      snowController,
      projectOwner,
      fundingCycleData,
      fundingCycleMetadata,
      splits,
      mockJbTerminal1,
      mockJbTerminal2,
    } = await setup();

    const groupedSplits = [{ group: 1, splits }];
    const terminals = [mockJbTerminal1.address, mockJbTerminal2.address];
    const fundAccessConstraints = makeFundingAccessConstraints({ terminals });

    fundingCycleMetadata.unpacked.ballotRedemptionRate = 10001; //not possible in packed metadata (shl of a negative value)

    let tx = snowController
      .connect(projectOwner)
      .launchFundingCyclesFor(
        EXISTING_PROJECT,
        fundingCycleData,
        fundingCycleMetadata.unpacked,
        PROJECT_START,
        groupedSplits,
        fundAccessConstraints,
        terminals,
        MEMO,
      );

    await expect(tx).to.be.revertedWith(errors.INVALID_BALLOT_REDEMPTION_RATE);
  });

  it(`Can't be called for a project by a non-owner`, async function () {
    const {
      snowController,
      projectOwner,
      nonOwner,
      fundingCycleData,
      fundingCycleMetadata,
      splits,
      mockJbTerminal1,
      mockJbTerminal2,
      mockJbOperatorStore,
    } = await setup();
    const groupedSplits = [{ group: 1, splits }];
    const terminals = [mockJbTerminal1.address, mockJbTerminal2.address];
    const fundAccessConstraints = makeFundingAccessConstraints({ terminals });

    await mockJbOperatorStore.mock.hasPermission
      .withArgs(nonOwner.address, projectOwner.address, EXISTING_PROJECT, RECONFIGURE_INDEX)
      .returns(false);

    await mockJbOperatorStore.mock.hasPermission
      .withArgs(nonOwner.address, projectOwner.address, 0, RECONFIGURE_INDEX)
      .returns(false);

    let tx = snowController
      .connect(nonOwner)
      .callStatic.launchFundingCyclesFor(
        EXISTING_PROJECT,
        fundingCycleData,
        fundingCycleMetadata.unpacked,
        PROJECT_START,
        groupedSplits,
        fundAccessConstraints,
        terminals,
        MEMO,
      );

    await expect(tx).to.be.revertedWith(errors.UNAUTHORIZED);
  });

  it(`Can't launch for a project with an existing funding cycle`, async function () {
    const {
      snowController,
      projectOwner,
      fundingCycleData,
      fundingCycleMetadata,
      splits,
      mockJbTerminal1,
      mockJbTerminal2,
    } = await setup();
    const groupedSplits = [{ group: 1, splits }];
    const terminals = [mockJbTerminal1.address, mockJbTerminal2.address];
    const fundAccessConstraints = makeFundingAccessConstraints({ terminals });

    let tx = snowController
      .connect(projectOwner)
      .callStatic.launchFundingCyclesFor(
        LAUNCHED_PROJECT,
        fundingCycleData,
        fundingCycleMetadata.unpacked,
        PROJECT_START,
        groupedSplits,
        fundAccessConstraints,
        terminals,
        MEMO,
      );

    await expect(tx).to.be.revertedWith(errors.FUNDING_CYCLE_ALREADY_LAUNCHED);
  });
});
