import { expect } from 'chai';
import { ethers } from 'hardhat';
import { deployMockContract } from '@ethereum-waffle/mock-contract';
import { makeSplits, packFundingCycleMetadata, setBalance } from '../../helpers/utils.js';
import errors from '../../helpers/errors.json';

import snowAllocator from '../../../artifacts/contracts/interfaces/ISNOWSplitAllocator.sol/ISNOWSplitAllocator.json';
import snowDirectory from '../../../artifacts/contracts/SNOWDirectory.sol/SNOWDirectory.json';
import SNOWETHPaymentTerminal from '../../../artifacts/contracts/SNOWETHPaymentTerminal.sol/SNOWETHPaymentTerminal.json';
import snowPaymentTerminalStore from '../../../artifacts/contracts/SNOWSingleTokenPaymentTerminalStore.sol/SNOWSingleTokenPaymentTerminalStore.json';
import snowFeeGauge from '../../../artifacts/contracts/interfaces/ISNOWFeeGauge.sol/ISNOWFeeGauge.json';
import snowOperatoreStore from '../../../artifacts/contracts/SNOWOperatorStore.sol/SNOWOperatorStore.json';
import snowProjects from '../../../artifacts/contracts/SNOWProjects.sol/SNOWProjects.json';
import snowSplitsStore from '../../../artifacts/contracts/SNOWSplitsStore.sol/SNOWSplitsStore.json';
import snowPrices from '../../../artifacts/contracts/SNOWPrices.sol/SNOWPrices.json';
import IERC20Metadata from '../../../artifacts/@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol/IERC20Metadata.json';

describe('SNOWPayoutRedemptionPaymentTerminal::distributePayoutsOf(...)', function () {
  const PLATFORM_PROJECT_ID = 1;
  const PROJECT_ID = 2;
  const OTHER_PROJECT_ID = 3;

  const AMOUNT_TO_DISTRIBUTE = 1100000000000;
  const AMOUNT_DISTRIBUTED = 1000000000000;

  const DEFAULT_FEE = 25000000; // 2.5%
  const FEE_DISCOUNT = 500000000; // 50%

  const CURRENCY = 1;
  const MIN_TOKEN_REQUESTED = 180;
  const MEMO = 'Memo Test';

  let ETH_ADDRESS;
  let ETH_PAYOUT_INDEX;
  let SPLITS_TOTAL_PERCENT;
  let MAX_FEE;
  let MAX_FEE_DISCOUNT;
  let AMOUNT_MINUS_FEES;

  let fundingCycle;

  before(async function () {
    let snowTokenFactory = await ethers.getContractFactory('SNOWTokens');
    let snowToken = await snowTokenFactory.deploy();

    let snowSplitsGroupsFactory = await ethers.getContractFactory('SNOWSplitsGroups');
    let snowSplitsGroups = await snowSplitsGroupsFactory.deploy();

    let snowConstantsFactory = await ethers.getContractFactory('SNOWConstants');
    let snowConstants = await snowConstantsFactory.deploy();

    ETH_PAYOUT_INDEX = await snowSplitsGroups.ETH_PAYOUT();

    ETH_ADDRESS = await snowToken.ETH();
    SPLITS_TOTAL_PERCENT = await snowConstants.SPLITS_TOTAL_PERCENT();
    MAX_FEE_DISCOUNT = await snowConstants.MAX_FEE_DISCOUNT();
    MAX_FEE = (await snowConstants.MAX_FEE()).toNumber();

    let FEE =
      AMOUNT_DISTRIBUTED - Math.floor((AMOUNT_DISTRIBUTED * MAX_FEE) / (DEFAULT_FEE + MAX_FEE));
    AMOUNT_MINUS_FEES = AMOUNT_DISTRIBUTED - FEE;
  });

  async function setup() {
    let [deployer, projectOwner, terminalOwner, caller, beneficiaryOne, beneficiaryTwo, ...addrs] =
      await ethers.getSigners();

    const blockNum = await ethers.provider.getBlockNumber();
    const block = await ethers.provider.getBlock(blockNum);
    const timestamp = block.timestamp;

    fundingCycle = {
      number: 1,
      configuration: timestamp,
      basedOn: timestamp,
      start: timestamp,
      duration: 0,
      weight: 0,
      discountRate: 0,
      ballot: ethers.constants.AddressZero,
      metadata: packFundingCycleMetadata(),
    };

    let [
      fakeToken,
      mockJbAllocator,
      mockJbDirectory,
      mockJbEthPaymentTerminal,
      mockSNOWPaymentTerminalStore,
      mockJbFeeGauge,
      mockJbOperatorStore,
      mockJbProjects,
      mockJbSplitsStore,
      mockJbPrices,
    ] = await Promise.all([
      deployMockContract(deployer, IERC20Metadata.abi),
      deployMockContract(deployer, snowAllocator.abi),
      deployMockContract(deployer, snowDirectory.abi),
      deployMockContract(deployer, SNOWETHPaymentTerminal.abi),
      deployMockContract(deployer, snowPaymentTerminalStore.abi),
      deployMockContract(deployer, snowFeeGauge.abi),
      deployMockContract(deployer, snowOperatoreStore.abi),
      deployMockContract(deployer, snowProjects.abi),
      deployMockContract(deployer, snowSplitsStore.abi),
      deployMockContract(deployer, snowPrices.abi),
    ]);

    const snowCurrenciesFactory = await ethers.getContractFactory('SNOWCurrencies');
    const snowCurrencies = await snowCurrenciesFactory.deploy();
    const CURRENCY_ETH = await snowCurrencies.ETH();
    const CURRENCY_USD = await snowCurrencies.USD();

    let snowEthTerminalFactory = await ethers.getContractFactory(
      'contracts/SNOWETHPaymentTerminal.sol:SNOWETHPaymentTerminal',
      deployer,
    );
    let snowErc20TerminalFactory = await ethers.getContractFactory(
      'contracts/SNOWERC20PaymentTerminal.sol:SNOWERC20PaymentTerminal',
      deployer,
    );

    let snowEthPaymentTerminal = await snowEthTerminalFactory
      .connect(deployer)
      .deploy(
        CURRENCY_ETH,
        mockJbOperatorStore.address,
        mockJbProjects.address,
        mockJbDirectory.address,
        mockJbSplitsStore.address,
        mockJbPrices.address,
        mockSNOWPaymentTerminalStore.address,
        terminalOwner.address,
      );

    await fakeToken.mock.decimals.returns(18);

    let snowErc20PaymentTerminal = await snowErc20TerminalFactory
      .connect(deployer)
      .deploy(
        fakeToken.address,
        CURRENCY_USD,
        CURRENCY_USD,
        1,
        mockJbOperatorStore.address,
        mockJbProjects.address,
        mockJbDirectory.address,
        mockJbSplitsStore.address,
        mockJbPrices.address,
        mockSNOWPaymentTerminalStore.address,
        terminalOwner.address,
      );

    await mockJbEthPaymentTerminal.mock.decimals.returns(18);

    await mockJbProjects.mock.ownerOf.withArgs(PROJECT_ID).returns(projectOwner.address);

    // Used with hardcoded one to get SNOWDao terminal
    await mockJbDirectory.mock.primaryTerminalOf
      .withArgs(1, ETH_ADDRESS)
      .returns(snowEthPaymentTerminal.address);

    // ETH distribution
    await mockSNOWPaymentTerminalStore.mock.recordDistributionFor
      .withArgs(PROJECT_ID, AMOUNT_TO_DISTRIBUTE, CURRENCY)
      .returns(fundingCycle, AMOUNT_DISTRIBUTED);

    // ERC20 distribution
    await mockSNOWPaymentTerminalStore.mock.recordDistributionFor
      .withArgs(PROJECT_ID, AMOUNT_TO_DISTRIBUTE, CURRENCY)
      .returns(fundingCycle, AMOUNT_DISTRIBUTED);

    await setBalance(snowEthPaymentTerminal.address, AMOUNT_DISTRIBUTED);

    return {
      deployer,
      projectOwner,
      terminalOwner,
      caller,
      beneficiaryOne,
      beneficiaryTwo,
      addrs,
      snowEthPaymentTerminal,
      snowErc20PaymentTerminal,
      mockJbAllocator,
      mockJbDirectory,
      mockJbEthPaymentTerminal,
      mockSNOWPaymentTerminalStore,
      mockJbFeeGauge,
      mockJbProjects,
      mockJbSplitsStore,
      timestamp,
      CURRENCY_USD,
      fakeToken,
    };
  }

  it('Should distribute payout without fee when fee is set to 0 and emit event', async function () {
    const {
      projectOwner,
      terminalOwner,
      caller,
      beneficiaryOne,
      beneficiaryTwo,
      snowEthPaymentTerminal,
      timestamp,
      mockJbSplitsStore,
    } = await setup();
    const splits = makeSplits({
      count: 2,
      beneficiary: [beneficiaryOne.address, beneficiaryTwo.address],
    });

    await snowEthPaymentTerminal.connect(terminalOwner).setFee(0);

    await mockJbSplitsStore.mock.splitsOf
      .withArgs(PROJECT_ID, timestamp, ETH_PAYOUT_INDEX)
      .returns(splits);

    let tx = await snowEthPaymentTerminal
      .connect(caller)
      .distributePayoutsOf(
        PROJECT_ID,
        AMOUNT_TO_DISTRIBUTE,
        ETH_PAYOUT_INDEX,
        ethers.constants.AddressZero,
        MIN_TOKEN_REQUESTED,
        MEMO,
      );

    await Promise.all(
      splits.map(async (split) => {
        await expect(tx)
          .to.emit(snowEthPaymentTerminal, 'DistributeToPayoutSplit')
          .withArgs(
            PROJECT_ID,
            /*_fundingCycle.configuration*/ timestamp,
            ETH_PAYOUT_INDEX,
            [
              split.preferClaimed,
              split.preferAddToBalance,
              split.percent,
              split.projectId,
              split.beneficiary,
              split.lockedUntil,
              split.allocator,
            ],
            /*payoutAmount*/ Math.floor(
              (AMOUNT_DISTRIBUTED * split.percent) / SPLITS_TOTAL_PERCENT,
            ),
            caller.address,
          );
      }),
    );

    expect(await tx)
      .to.emit(snowEthPaymentTerminal, 'DistributePayouts')
      .withArgs(
        timestamp,
        /*_fundingCycle.number*/ 1,
        PROJECT_ID,
        projectOwner.address,
        /*amount*/ AMOUNT_TO_DISTRIBUTE,
        /*distributedAmount*/ AMOUNT_DISTRIBUTED,
        /*_feeAmount*/ 0,
        /*_leftoverDistributionAmount*/ 0,
        MEMO,
        caller.address,
      );
  });

  it('Should distribute payout and emit event, without fee if the beneficiary is another project within the same terminal', async function () {
    const {
      projectOwner,
      caller,
      beneficiaryOne,
      beneficiaryTwo,
      snowEthPaymentTerminal,
      timestamp,
      mockJbDirectory,
      mockSNOWPaymentTerminalStore,
      mockJbSplitsStore,
    } = await setup();
    const splits = makeSplits({
      count: 2,
      projectId: OTHER_PROJECT_ID,
      beneficiary: [beneficiaryOne.address, beneficiaryTwo.address],
    });

    await mockJbDirectory.mock.primaryTerminalOf
      .withArgs(OTHER_PROJECT_ID, ETH_ADDRESS)
      .returns(snowEthPaymentTerminal.address);

    await mockJbSplitsStore.mock.splitsOf
      .withArgs(PROJECT_ID, timestamp, ETH_PAYOUT_INDEX)
      .returns(splits);

    await Promise.all(
      splits.map(async (split) => {
        await mockSNOWPaymentTerminalStore.mock.recordPaymentFrom
          .withArgs(
            snowEthPaymentTerminal.address,
            [
              /*token*/ '0x000000000000000000000000000000000000eeee',
              /*amount paid*/ Math.floor(
              (AMOUNT_DISTRIBUTED * split.percent) / SPLITS_TOTAL_PERCENT,
            ),
              /*decimal*/ 18,
              CURRENCY,
            ],
            split.projectId,
            CURRENCY,
            split.beneficiary,
            '',
            ethers.utils.hexZeroPad(ethers.utils.hexlify(PROJECT_ID), 32),
          )
          .returns(fundingCycle, /*count*/ 0, /* delegate */ ethers.constants.AddressZero, '');
      }),
    );

    let tx = await snowEthPaymentTerminal
      .connect(caller)
      .distributePayoutsOf(
        PROJECT_ID,
        AMOUNT_TO_DISTRIBUTE,
        ETH_PAYOUT_INDEX,
        ethers.constants.AddressZero,
        MIN_TOKEN_REQUESTED,
        MEMO,
      );

    await Promise.all(
      splits.map(async (split) => {
        await expect(tx)
          .to.emit(snowEthPaymentTerminal, 'DistributeToPayoutSplit')
          .withArgs(
            PROJECT_ID,
            /*_fundingCycle.configuration*/ timestamp,
            ETH_PAYOUT_INDEX,
            [
              split.preferClaimed,
              split.preferAddToBalance,
              split.percent,
              split.projectId,
              split.beneficiary,
              split.lockedUntil,
              split.allocator,
            ],
            /*payoutAmount*/ Math.floor(
              (AMOUNT_DISTRIBUTED * split.percent) / SPLITS_TOTAL_PERCENT,
            ),
            caller.address,
          )
          .and.to.emit(snowEthPaymentTerminal, 'Pay')
          .withArgs(
            timestamp,
            1,
            split.projectId,
            snowEthPaymentTerminal.address,
            split.beneficiary,
            Math.floor((AMOUNT_DISTRIBUTED * split.percent) / SPLITS_TOTAL_PERCENT),
            0,
            '',
            ethers.utils.hexZeroPad(ethers.utils.hexlify(PROJECT_ID), 32),
            caller.address,
          );
      }),
    );

    expect(await tx)
      .to.emit(snowEthPaymentTerminal, 'DistributePayouts')
      .withArgs(
        /*_fundingCycle.configuration*/ timestamp,
        /*_fundingCycle.number*/ 1,
        PROJECT_ID,
        projectOwner.address,
        /*_amount*/ AMOUNT_TO_DISTRIBUTE,
        /*_distributedAmount*/ AMOUNT_DISTRIBUTED,
        /*_feeAmount*/ 0,
        /*_leftoverDistributionAmount*/ 0,
        MEMO,
        caller.address,
      );
  });

  it("Should distribute payout and emit event, without fee if the platform project has not terminal for this terminal's token", async function () {
    const {
      projectOwner,
      caller,
      beneficiaryOne,
      beneficiaryTwo,
      snowEthPaymentTerminal,
      timestamp,
      mockJbDirectory,
      mockSNOWPaymentTerminalStore,
      mockJbSplitsStore,
    } = await setup();
    const splits = makeSplits({
      count: 2,
      projectId: OTHER_PROJECT_ID,
      beneficiary: [beneficiaryOne.address, beneficiaryTwo.address],
    });

    await mockJbDirectory.mock.primaryTerminalOf
      .withArgs(OTHER_PROJECT_ID, ETH_ADDRESS)
      .returns(snowEthPaymentTerminal.address);

    await mockJbDirectory.mock.primaryTerminalOf
      .withArgs(1, ETH_ADDRESS)
      .returns(ethers.constants.AddressZero);

    await mockJbSplitsStore.mock.splitsOf
      .withArgs(PROJECT_ID, timestamp, ETH_PAYOUT_INDEX)
      .returns(splits);

    await Promise.all(
      splits.map(async (split) => {
        await mockSNOWPaymentTerminalStore.mock.recordPaymentFrom
          .withArgs(
            snowEthPaymentTerminal.address,
            [
              /*token*/ '0x000000000000000000000000000000000000eeee',
              /*amount paid*/ Math.floor(
              (AMOUNT_DISTRIBUTED * split.percent) / SPLITS_TOTAL_PERCENT,
            ),
              /*decimal*/ 18,
              CURRENCY,
            ],
            split.projectId,
            CURRENCY,
            split.beneficiary,
            '',
            ethers.utils.hexZeroPad(ethers.utils.hexlify(PROJECT_ID), 32),
          )
          .returns(fundingCycle, 0, /* delegate */ ethers.constants.AddressZero, '');
      }),
    );

    let tx = await snowEthPaymentTerminal
      .connect(caller)
      .distributePayoutsOf(
        PROJECT_ID,
        AMOUNT_TO_DISTRIBUTE,
        ETH_PAYOUT_INDEX,
        ethers.constants.AddressZero,
        MIN_TOKEN_REQUESTED,
        MEMO,
      );

    await Promise.all(
      splits.map(async (split) => {
        await expect(tx)
          .to.emit(snowEthPaymentTerminal, 'DistributeToPayoutSplit')
          .withArgs(
            PROJECT_ID,
            /*_fundingCycle.configuration*/ timestamp,
            ETH_PAYOUT_INDEX,
            [
              split.preferClaimed,
              split.preferAddToBalance,
              split.percent,
              split.projectId,
              split.beneficiary,
              split.lockedUntil,
              split.allocator,
            ],
            /*payoutAmount*/ Math.floor(
              (AMOUNT_DISTRIBUTED * split.percent) / SPLITS_TOTAL_PERCENT,
            ),
            caller.address,
          )
          .and.to.emit(snowEthPaymentTerminal, 'Pay')
          .withArgs(
            timestamp,
            1,
            split.projectId,
            snowEthPaymentTerminal.address,
            split.beneficiary,
            Math.floor((AMOUNT_DISTRIBUTED * split.percent) / SPLITS_TOTAL_PERCENT),
            0,
            '',
            ethers.utils.hexZeroPad(ethers.utils.hexlify(PROJECT_ID), 32),
            caller.address,
          );
      }),
    );

    expect(await tx)
      .to.emit(snowEthPaymentTerminal, 'DistributePayouts')
      .withArgs(
        /*_fundingCycle.configuration*/ timestamp,
        /*_fundingCycle.number*/ 1,
        PROJECT_ID,
        projectOwner.address,
        /*_amount*/ AMOUNT_TO_DISTRIBUTE,
        /*_distributedAmount*/ AMOUNT_DISTRIBUTED,
        /*_feeAmount*/ 0,
        /*_leftoverDistributionAmount*/ 0,
        MEMO,
        caller.address,
      );
  });

  it('Should distribute payout minus fee, hold the fee in the contract and emit event', async function () {
    const {
      projectOwner,
      caller,
      beneficiaryOne,
      beneficiaryTwo,
      snowEthPaymentTerminal,
      timestamp,
      mockSNOWPaymentTerminalStore,
      mockJbSplitsStore,
    } = await setup();
    const splits = makeSplits({
      count: 2,
      beneficiary: [beneficiaryOne.address, beneficiaryTwo.address],
    });

    await mockSNOWPaymentTerminalStore.mock.recordDistributionFor
      .withArgs(PROJECT_ID, AMOUNT_TO_DISTRIBUTE, CURRENCY)
      .returns(
        {
          number: 1,
          configuration: timestamp,
          basedOn: timestamp,
          start: timestamp,
          duration: 0,
          weight: 0,
          discountRate: 0,
          ballot: ethers.constants.AddressZero,
          metadata: packFundingCycleMetadata({ holdFees: 1 }),
        },
        AMOUNT_DISTRIBUTED,
      );

    await mockJbSplitsStore.mock.splitsOf
      .withArgs(PROJECT_ID, timestamp, ETH_PAYOUT_INDEX)
      .returns(splits);

    let tx = await snowEthPaymentTerminal
      .connect(caller)
      .distributePayoutsOf(
        PROJECT_ID,
        AMOUNT_TO_DISTRIBUTE,
        ETH_PAYOUT_INDEX,
        ethers.constants.AddressZero,
        MIN_TOKEN_REQUESTED,
        MEMO,
      );

    await Promise.all(
      splits.map(async (split) => {
        await expect(tx)
          .to.emit(snowEthPaymentTerminal, 'DistributeToPayoutSplit')
          .withArgs(
            PROJECT_ID,
            /*_fundingCycle.configuration*/ timestamp,
            ETH_PAYOUT_INDEX,
            [
              split.preferClaimed,
              split.preferAddToBalance,
              split.percent,
              split.projectId,
              split.beneficiary,
              split.lockedUntil,
              split.allocator,
            ],
            /*payoutAmount*/ Math.floor((AMOUNT_MINUS_FEES * split.percent) / SPLITS_TOTAL_PERCENT),
            caller.address,
          );
      }),
    );

    expect(await tx)
      .to.emit(snowEthPaymentTerminal, 'DistributePayouts')
      .withArgs(
        /*_fundingCycle.configuration*/ timestamp,
        1,
        PROJECT_ID,
        projectOwner.address,
        /*_amount*/ AMOUNT_TO_DISTRIBUTE,
        /*_distributedAmount*/ AMOUNT_DISTRIBUTED,
        /*_feeAmount*/ AMOUNT_DISTRIBUTED - AMOUNT_MINUS_FEES,
        /*_leftoverDistributionAmount*/ 0,
        MEMO,
        caller.address,
      );

    expect(await snowEthPaymentTerminal.heldFeesOf(PROJECT_ID)).to.eql([
      [
        ethers.BigNumber.from(AMOUNT_DISTRIBUTED),
        DEFAULT_FEE,
        /*discount*/ 0,
        projectOwner.address,
      ],
    ]);
  });

  it('Should distribute payout minus fee and pay the fee via Juicebox DAO terminal, if using another terminal', async function () {
    const {
      projectOwner,
      caller,
      beneficiaryOne,
      beneficiaryTwo,
      snowEthPaymentTerminal,
      timestamp,
      mockJbEthPaymentTerminal,
      mockJbDirectory,
      mockJbSplitsStore,
    } = await setup();
    const splits = makeSplits({
      count: 2,
      beneficiary: [beneficiaryOne.address, beneficiaryTwo.address],
    });

    await mockJbSplitsStore.mock.splitsOf
      .withArgs(PROJECT_ID, timestamp, ETH_PAYOUT_INDEX)
      .returns(splits);

    await mockJbDirectory.mock.primaryTerminalOf
      .withArgs(1, ETH_ADDRESS)
      .returns(mockJbEthPaymentTerminal.address);

    await mockJbEthPaymentTerminal.mock.pay
      .withArgs(
        1, //SNOWX Dao
        AMOUNT_DISTRIBUTED - AMOUNT_MINUS_FEES,
        ETH_ADDRESS,
        projectOwner.address,
        0,
        /*preferedClaimedToken*/ false,
        '',
        '0x',
      )
      .returns(0);

    let tx = await snowEthPaymentTerminal
      .connect(caller)
      .distributePayoutsOf(
        PROJECT_ID,
        AMOUNT_TO_DISTRIBUTE,
        ETH_PAYOUT_INDEX,
        ethers.constants.AddressZero,
        MIN_TOKEN_REQUESTED,
        MEMO,
      );

    await Promise.all(
      splits.map(async (split) => {
        await expect(tx)
          .to.emit(snowEthPaymentTerminal, 'DistributeToPayoutSplit')
          .withArgs(
            PROJECT_ID,
            /*_fundingCycle.configuration*/ timestamp,
            ETH_PAYOUT_INDEX,
            [
              split.preferClaimed,
              split.preferAddToBalance,
              split.percent,
              split.projectId,
              split.beneficiary,
              split.lockedUntil,
              split.allocator,
            ],
            /*payoutAmount*/ Math.floor((AMOUNT_MINUS_FEES * split.percent) / SPLITS_TOTAL_PERCENT),
            caller.address,
          );
      }),
    );

    expect(await tx)
      .to.emit(snowEthPaymentTerminal, 'DistributePayouts')
      .withArgs(
        /*_fundingCycle.configuration*/ timestamp,
        /*_fundingCycle.number*/ 1,
        PROJECT_ID,
        projectOwner.address,
        /*_amount*/ AMOUNT_TO_DISTRIBUTE,
        /*_distributedAmount*/ AMOUNT_DISTRIBUTED,
        /*_feeAmount*/ AMOUNT_DISTRIBUTED - AMOUNT_MINUS_FEES,
        /*_leftoverDistributionAmount*/ 0,
        MEMO,
        caller.address,
      );
  });

  it('Should distribute payout without fee if distributing to a project in another terminal not subject to fees, using add to balance', async function () {
    const {
      projectOwner,
      terminalOwner,
      caller,
      snowEthPaymentTerminal,
      timestamp,
      mockJbDirectory,
      mockJbEthPaymentTerminal,
      mockJbSplitsStore,
    } = await setup();
    const splits = makeSplits({ count: 2, projectId: OTHER_PROJECT_ID, preferAddToBalance: true });

    await mockJbDirectory.mock.primaryTerminalOf
      .withArgs(OTHER_PROJECT_ID, ETH_ADDRESS)
      .returns(mockJbEthPaymentTerminal.address);

    await mockJbSplitsStore.mock.splitsOf
      .withArgs(PROJECT_ID, timestamp, ETH_PAYOUT_INDEX)
      .returns(splits);

    await Promise.all(
      splits.map(async (split) => {
        await mockJbEthPaymentTerminal.mock.addToBalanceOf
          .withArgs(
            split.projectId,
            /*payoutAmount*/ Math.floor(
              (AMOUNT_DISTRIBUTED * split.percent) / SPLITS_TOTAL_PERCENT,
            ),
            ETH_ADDRESS,
            '',
            ethers.utils.hexZeroPad(ethers.utils.hexlify(PROJECT_ID), 32),
          )
          .returns();
      }),
    );

    await snowEthPaymentTerminal
      .connect(terminalOwner)
      .setFeelessAddress(mockJbEthPaymentTerminal.address, true);

    let tx = await snowEthPaymentTerminal
      .connect(caller)
      .distributePayoutsOf(
        PROJECT_ID,
        AMOUNT_TO_DISTRIBUTE,
        ETH_PAYOUT_INDEX,
        ethers.constants.AddressZero,
        MIN_TOKEN_REQUESTED,
        MEMO,
      );

    await Promise.all(
      splits.map(async (split) => {
        await expect(tx)
          .to.emit(snowEthPaymentTerminal, 'DistributeToPayoutSplit')
          .withArgs(
            PROJECT_ID,
            /*_fundingCycle.configuration*/ timestamp,
            ETH_PAYOUT_INDEX,
            [
              split.preferClaimed,
              split.preferAddToBalance,
              split.percent,
              split.projectId,
              split.beneficiary,
              split.lockedUntil,
              split.allocator,
            ],
            /*payoutAmount*/ Math.floor(
              (AMOUNT_DISTRIBUTED * split.percent) / SPLITS_TOTAL_PERCENT,
            ),
            caller.address,
          );
      }),
    );

    expect(await tx)
      .to.emit(snowEthPaymentTerminal, 'DistributePayouts')
      .withArgs(
        /*_fundingCycle.configuration*/ timestamp,
        /*_fundingCycle.number*/ 1,
        PROJECT_ID,
        projectOwner.address,
        /*_amount*/ AMOUNT_TO_DISTRIBUTE,
        /*_distributedAmount*/ AMOUNT_DISTRIBUTED,
        /*_feeAmount*/ 0,
        /*_leftoverDistributionAmount*/ 0,
        MEMO,
        caller.address,
      );
  });

  it('Should distribute payout without fee if distributing to a project in another terminal not subject to fees, using pay, with a beneficiary', async function () {
    const {
      projectOwner,
      terminalOwner,
      caller,
      snowEthPaymentTerminal,
      timestamp,
      mockJbDirectory,
      mockJbEthPaymentTerminal,
      mockJbSplitsStore,
    } = await setup();
    const beneficiaryOne = ethers.Wallet.createRandom();
    const beneficiaryTwo = ethers.Wallet.createRandom();

    const splits = makeSplits({
      count: 2,
      projectId: OTHER_PROJECT_ID,
      preferAddToBalance: false,
      beneficiary: [beneficiaryOne.address, beneficiaryTwo.address],
    });

    await mockJbDirectory.mock.primaryTerminalOf
      .withArgs(OTHER_PROJECT_ID, ETH_ADDRESS)
      .returns(mockJbEthPaymentTerminal.address);

    await mockJbSplitsStore.mock.splitsOf
      .withArgs(PROJECT_ID, timestamp, ETH_PAYOUT_INDEX)
      .returns(splits);

    await Promise.all(
      splits.map(async (split) => {
        await mockJbEthPaymentTerminal.mock.pay
          .withArgs(
            split.projectId,
            /*payoutAmount*/ Math.floor(
              (AMOUNT_DISTRIBUTED * split.percent) / SPLITS_TOTAL_PERCENT,
            ),
            ETH_ADDRESS,
            split.beneficiary,
            0,
            split.preferClaimed,
            '',
            ethers.utils.hexZeroPad(ethers.utils.hexlify(PROJECT_ID), 32),
          )
          .returns(0);
      }),
    );

    await snowEthPaymentTerminal
      .connect(terminalOwner)
      .setFeelessAddress(mockJbEthPaymentTerminal.address, true);

    let tx = await snowEthPaymentTerminal
      .connect(caller)
      .distributePayoutsOf(
        PROJECT_ID,
        AMOUNT_TO_DISTRIBUTE,
        ETH_PAYOUT_INDEX,
        ethers.constants.AddressZero,
        MIN_TOKEN_REQUESTED,
        MEMO,
      );

    await Promise.all(
      splits.map(async (split) => {
        await expect(tx)
          .to.emit(snowEthPaymentTerminal, 'DistributeToPayoutSplit')
          .withArgs(
            PROJECT_ID,
            /*_fundingCycle.configuration*/ timestamp,
            ETH_PAYOUT_INDEX,
            [
              split.preferClaimed,
              split.preferAddToBalance,
              split.percent,
              split.projectId,
              split.beneficiary,
              split.lockedUntil,
              split.allocator,
            ],
            /*payoutAmount*/ Math.floor(
              (AMOUNT_DISTRIBUTED * split.percent) / SPLITS_TOTAL_PERCENT,
            ),
            caller.address,
          );
      }),
    );

    expect(await tx)
      .to.emit(snowEthPaymentTerminal, 'DistributePayouts')
      .withArgs(
        /*_fundingCycle.configuration*/ timestamp,
        /*_fundingCycle.number*/ 1,
        PROJECT_ID,
        projectOwner.address,
        /*_amount*/ AMOUNT_TO_DISTRIBUTE,
        /*_distributedAmount*/ AMOUNT_DISTRIBUTED,
        /*_feeAmount*/ 0,
        /*_leftoverDistributionAmount*/ 0,
        MEMO,
        caller.address,
      );
  });

  it('Should distribute payout without fee if distributing to a project in another terminal not subject to fees, using pay, with caller as default beneficiary', async function () {
    const {
      projectOwner,
      terminalOwner,
      caller,
      snowEthPaymentTerminal,
      timestamp,
      mockJbDirectory,
      mockJbEthPaymentTerminal,
      mockJbSplitsStore,
    } = await setup();

    const splits = makeSplits({ count: 2, projectId: OTHER_PROJECT_ID, preferAddToBalance: false });

    await mockJbDirectory.mock.primaryTerminalOf
      .withArgs(OTHER_PROJECT_ID, ETH_ADDRESS)
      .returns(mockJbEthPaymentTerminal.address);

    await mockJbSplitsStore.mock.splitsOf
      .withArgs(PROJECT_ID, timestamp, ETH_PAYOUT_INDEX)
      .returns(splits);

    await Promise.all(
      splits.map(async (split) => {
        await mockJbEthPaymentTerminal.mock.pay
          .withArgs(
            split.projectId,
            /*payoutAmount*/ Math.floor(
              (AMOUNT_DISTRIBUTED * split.percent) / SPLITS_TOTAL_PERCENT,
            ),
            ETH_ADDRESS,
            caller.address,
            0,
            split.preferClaimed,
            '',
            ethers.utils.hexZeroPad(ethers.utils.hexlify(PROJECT_ID), 32),
          )
          .returns(0);
      }),
    );

    await snowEthPaymentTerminal
      .connect(terminalOwner)
      .setFeelessAddress(mockJbEthPaymentTerminal.address, true);

    let tx = await snowEthPaymentTerminal
      .connect(caller)
      .distributePayoutsOf(
        PROJECT_ID,
        AMOUNT_TO_DISTRIBUTE,
        ETH_PAYOUT_INDEX,
        ethers.constants.AddressZero,
        MIN_TOKEN_REQUESTED,
        MEMO,
      );

    await Promise.all(
      splits.map(async (split) => {
        await expect(tx)
          .to.emit(snowEthPaymentTerminal, 'DistributeToPayoutSplit')
          .withArgs(
            PROJECT_ID,
            /*_fundingCycle.configuration*/ timestamp,
            ETH_PAYOUT_INDEX,
            [
              split.preferClaimed,
              split.preferAddToBalance,
              split.percent,
              split.projectId,
              split.beneficiary,
              split.lockedUntil,
              split.allocator,
            ],
            /*payoutAmount*/ Math.floor(
              (AMOUNT_DISTRIBUTED * split.percent) / SPLITS_TOTAL_PERCENT,
            ),
            caller.address,
          );
      }),
    );

    expect(await tx)
      .to.emit(snowEthPaymentTerminal, 'DistributePayouts')
      .withArgs(
        /*_fundingCycle.configuration*/ timestamp,
        /*_fundingCycle.number*/ 1,
        PROJECT_ID,
        projectOwner.address,
        /*_amount*/ AMOUNT_TO_DISTRIBUTE,
        /*_distributedAmount*/ AMOUNT_DISTRIBUTED,
        /*_feeAmount*/ 0,
        /*_leftoverDistributionAmount*/ 0,
        MEMO,
        caller.address,
      );
  });

  it('Should distribute to projects in same terminal using pay if prefered', async function () {
    const {
      projectOwner,
      caller,
      beneficiaryOne,
      beneficiaryTwo,
      snowEthPaymentTerminal,
      timestamp,
      mockJbEthPaymentTerminal,
      mockJbDirectory,
      mockJbSplitsStore,
    } = await setup();
    const splits = makeSplits({
      count: 2,
      beneficiary: [beneficiaryOne.address, beneficiaryTwo.address],
      preferAddToBalance: false,
    });

    await mockJbSplitsStore.mock.splitsOf
      .withArgs(PROJECT_ID, timestamp, ETH_PAYOUT_INDEX)
      .returns(splits);

    await mockJbDirectory.mock.primaryTerminalOf
      .withArgs(1, ETH_ADDRESS)
      .returns(mockJbEthPaymentTerminal.address);

    // Fee
    await mockJbEthPaymentTerminal.mock.pay
      .withArgs(
        1, //SNOWX Dao
        AMOUNT_DISTRIBUTED - AMOUNT_MINUS_FEES,
        ETH_ADDRESS,
        projectOwner.address,
        0,
        /*preferedClaimedToken*/ false,
        '',
        '0x',
      )
      .returns(0);

    await mockJbEthPaymentTerminal.mock.addToBalanceOf
      .withArgs(
        1, //SNOWX Dao
        AMOUNT_DISTRIBUTED - AMOUNT_MINUS_FEES,
        ETH_ADDRESS,
        '',
        '0x',
      )
      .returns();

    let tx = await snowEthPaymentTerminal
      .connect(caller)
      .distributePayoutsOf(
        PROJECT_ID,
        AMOUNT_TO_DISTRIBUTE,
        ETH_PAYOUT_INDEX,
        ethers.constants.AddressZero,
        MIN_TOKEN_REQUESTED,
        MEMO,
      );

    await Promise.all(
      splits.map(async (split) => {
        await expect(tx)
          .to.emit(snowEthPaymentTerminal, 'DistributeToPayoutSplit')
          .withArgs(
            PROJECT_ID,
            /*_fundingCycle.configuration*/ timestamp,
            ETH_PAYOUT_INDEX,
            [
              split.preferClaimed,
              split.preferAddToBalance,
              split.percent,
              split.projectId,
              split.beneficiary,
              split.lockedUntil,
              split.allocator,
            ],
            /*payoutAmount*/ Math.floor((AMOUNT_MINUS_FEES * split.percent) / SPLITS_TOTAL_PERCENT),
            caller.address,
          );
      }),
    );

    expect(await tx)
      .to.emit(snowEthPaymentTerminal, 'DistributePayouts')
      .withArgs(
        /*_fundingCycle.configuration*/ timestamp,
        /*_fundingCycle.number*/ 1,
        PROJECT_ID,
        projectOwner.address,
        /*_amount*/ AMOUNT_TO_DISTRIBUTE,
        /*_distributedAmount*/ AMOUNT_DISTRIBUTED,
        /*_feeAmount*/ AMOUNT_DISTRIBUTED - AMOUNT_MINUS_FEES,
        /*_leftoverDistributionAmount*/ 0,
        MEMO,
        caller.address,
      );
  });

  it('Should distribute to projects in same terminal using addToBalance if prefered', async function () {
    const {
      projectOwner,
      caller,
      beneficiaryOne,
      beneficiaryTwo,
      snowEthPaymentTerminal,
      timestamp,
      mockJbEthPaymentTerminal,
      mockJbDirectory,
      mockJbSplitsStore,
    } = await setup();
    const splits = makeSplits({
      count: 2,
      beneficiary: [beneficiaryOne.address, beneficiaryTwo.address],
      preferAddToBalance: true,
    });

    await mockJbSplitsStore.mock.splitsOf
      .withArgs(PROJECT_ID, timestamp, ETH_PAYOUT_INDEX)
      .returns(splits);

    await mockJbDirectory.mock.primaryTerminalOf
      .withArgs(1, ETH_ADDRESS)
      .returns(mockJbEthPaymentTerminal.address);

    // Fee
    await mockJbEthPaymentTerminal.mock.pay
      .withArgs(
        1, //SNOWX Dao
        AMOUNT_DISTRIBUTED - AMOUNT_MINUS_FEES,
        ETH_ADDRESS,
        projectOwner.address,
        0,
        /*preferedClaimedToken*/ false,
        '',
        '0x',
      )
      .returns(0);

    await mockJbEthPaymentTerminal.mock.addToBalanceOf
      .withArgs(
        1, //SNOWX Dao
        AMOUNT_DISTRIBUTED - AMOUNT_MINUS_FEES,
        ETH_ADDRESS,
        '',
        '0x',
      )
      .returns();

    let tx = await snowEthPaymentTerminal
      .connect(caller)
      .distributePayoutsOf(
        PROJECT_ID,
        AMOUNT_TO_DISTRIBUTE,
        ETH_PAYOUT_INDEX,
        ethers.constants.AddressZero,
        MIN_TOKEN_REQUESTED,
        MEMO,
      );

    await Promise.all(
      splits.map(async (split) => {
        await expect(tx)
          .to.emit(snowEthPaymentTerminal, 'DistributeToPayoutSplit')
          .withArgs(
            PROJECT_ID,
            /*_fundingCycle.configuration*/ timestamp,
            ETH_PAYOUT_INDEX,
            [
              split.preferClaimed,
              split.preferAddToBalance,
              split.percent,
              split.projectId,
              split.beneficiary,
              split.lockedUntil,
              split.allocator,
            ],
            /*payoutAmount*/ Math.floor((AMOUNT_MINUS_FEES * split.percent) / SPLITS_TOTAL_PERCENT),
            caller.address,
          );
      }),
    );

    expect(await tx)
      .to.emit(snowEthPaymentTerminal, 'DistributePayouts')
      .withArgs(
        /*_fundingCycle.configuration*/ timestamp,
        /*_fundingCycle.number*/ 1,
        PROJECT_ID,
        projectOwner.address,
        /*_amount*/ AMOUNT_TO_DISTRIBUTE,
        /*_distributedAmount*/ AMOUNT_DISTRIBUTED,
        /*_feeAmount*/ AMOUNT_DISTRIBUTED - AMOUNT_MINUS_FEES,
        /*_leftoverDistributionAmount*/ 0,
        MEMO,
        caller.address,
      );
  });

  it('Should distribute payout minus fee and pay the fee via the same terminal, if using Juicebox DAO terminal', async function () {
    const {
      projectOwner,
      caller,
      beneficiaryOne,
      beneficiaryTwo,
      snowEthPaymentTerminal,
      timestamp,
      mockSNOWPaymentTerminalStore,
      mockJbDirectory,
      mockJbSplitsStore,
    } = await setup();
    const AMOUNT_MINUS_FEES = Math.floor((AMOUNT_DISTRIBUTED * MAX_FEE) / (DEFAULT_FEE + MAX_FEE));
    const splits = makeSplits({
      count: 2,
      beneficiary: [beneficiaryOne.address, beneficiaryTwo.address],
    });

    await mockJbSplitsStore.mock.splitsOf
      .withArgs(PROJECT_ID, timestamp, ETH_PAYOUT_INDEX)
      .returns(splits);

    await mockSNOWPaymentTerminalStore.mock.recordPaymentFrom
      .withArgs(
        snowEthPaymentTerminal.address,
        [
          /*token*/ '0x000000000000000000000000000000000000eeee',
          /*amount paid*/ AMOUNT_DISTRIBUTED - AMOUNT_MINUS_FEES,
          /*decimal*/ 18,
          CURRENCY,
        ],
        PLATFORM_PROJECT_ID,
        /*CURRENCY*/ CURRENCY,
        projectOwner.address,
        '',
        '0x',
      )
      .returns(fundingCycle, 0, /* delegate */ ethers.constants.AddressZero, '');

    await Promise.all(
      splits.map(async (split) => {
        await mockSNOWPaymentTerminalStore.mock.recordPaymentFrom
          .withArgs(
            snowEthPaymentTerminal.address,
            [
              /*token*/ '0x000000000000000000000000000000000000eeee',
              /*amount paid*/ Math.floor(
              (AMOUNT_MINUS_FEES * split.percent) / SPLITS_TOTAL_PERCENT,
            ),
              /*decimal*/ 18,
              CURRENCY,
            ],
            split.projectId,
            CURRENCY,
            split.beneficiary,
            '',
            '0x',
          )
          .returns(fundingCycle, 0, /* delegate */ ethers.constants.AddressZero, '');
      }),
    );

    let tx = await snowEthPaymentTerminal
      .connect(caller)
      .distributePayoutsOf(
        PROJECT_ID,
        AMOUNT_TO_DISTRIBUTE,
        ETH_PAYOUT_INDEX,
        ethers.constants.AddressZero,
        MIN_TOKEN_REQUESTED,
        MEMO,
      );

    await Promise.all(
      splits.map(async (split) => {
        await expect(tx)
          .to.emit(snowEthPaymentTerminal, 'DistributeToPayoutSplit')
          .withArgs(
            PROJECT_ID,
            /*_fundingCycle.configuration*/ timestamp,
            ETH_PAYOUT_INDEX,
            [
              split.preferClaimed,
              split.preferAddToBalance,
              split.percent,
              split.projectId,
              split.beneficiary,
              split.lockedUntil,
              split.allocator,
            ],
            /*payoutAmount*/ Math.floor((AMOUNT_MINUS_FEES * split.percent) / SPLITS_TOTAL_PERCENT),
            caller.address,
          )
          .and.to.emit(snowEthPaymentTerminal, 'Pay')
          .withArgs(
            timestamp,
            1,
            /*projectId*/ 1,
            snowEthPaymentTerminal.address,
            projectOwner.address,
            Math.floor(AMOUNT_DISTRIBUTED - AMOUNT_MINUS_FEES),
            0,
            '',
            '0x',
            caller.address,
          );
      }),
    );

    expect(await tx)
      .to.emit(snowEthPaymentTerminal, 'DistributePayouts')
      .withArgs(
        /*_fundingCycle.configuration*/ timestamp,
        /*_fundingCycle.number*/ 1,
        PROJECT_ID,
        projectOwner.address,
        /*_amount*/ AMOUNT_TO_DISTRIBUTE,
        /*_distributedAmount*/ AMOUNT_DISTRIBUTED,
        /*_feeAmount*/ AMOUNT_DISTRIBUTED - AMOUNT_MINUS_FEES,
        /*_leftoverDistributionAmount*/ 0,
        MEMO,
        caller.address,
      );
  });

  it('Should distribute payout minus discounted fee if a fee gauge is set', async function () {
    const {
      projectOwner,
      terminalOwner,
      caller,
      beneficiaryOne,
      beneficiaryTwo,
      snowEthPaymentTerminal,
      timestamp,
      mockJbDirectory,
      mockJbEthPaymentTerminal,
      mockJbFeeGauge,
      mockJbSplitsStore,
    } = await setup();

    const DISCOUNTED_FEE =
      DEFAULT_FEE - Math.floor((DEFAULT_FEE * FEE_DISCOUNT) / MAX_FEE_DISCOUNT);
    const AMOUNT_MINUS_FEES = Math.floor(
      (AMOUNT_DISTRIBUTED * MAX_FEE) / (MAX_FEE + DISCOUNTED_FEE),
    );
    const FEE_AMOUNT = AMOUNT_DISTRIBUTED - AMOUNT_MINUS_FEES;

    const splits = makeSplits({
      count: 2,
      beneficiary: [beneficiaryOne.address, beneficiaryTwo.address],
    });

    await snowEthPaymentTerminal.connect(terminalOwner).setFeeGauge(mockJbFeeGauge.address);

    await mockJbFeeGauge.mock.currentDiscountFor.withArgs(PROJECT_ID).returns(FEE_DISCOUNT);

    await mockJbSplitsStore.mock.splitsOf
      .withArgs(PROJECT_ID, timestamp, ETH_PAYOUT_INDEX)
      .returns(splits);

    await mockJbDirectory.mock.primaryTerminalOf
      .withArgs(1, ETH_ADDRESS)
      .returns(mockJbEthPaymentTerminal.address);

    await mockJbEthPaymentTerminal.mock.pay
      .withArgs(
        1, //SNOWX Dao
        FEE_AMOUNT,
        ETH_ADDRESS,
        projectOwner.address,
        0,
        false,
        '',
        '0x',
      )
      .returns(0);

    await Promise.all(
      splits.map(async (split) => {
        await mockJbEthPaymentTerminal.mock.pay
          .withArgs(
            split.projectId, //SNOWX Dao
            /*payoutAmount*/ Math.floor((AMOUNT_MINUS_FEES * split.percent) / SPLITS_TOTAL_PERCENT),
            ETH_ADDRESS,
            split.beneficiary,
            0,
            split.preferClaimed,
            '',
            '0x',
          )
          .returns(0);
      }),
    );

    let tx = await snowEthPaymentTerminal
      .connect(caller)
      .distributePayoutsOf(
        PROJECT_ID,
        AMOUNT_TO_DISTRIBUTE,
        ETH_PAYOUT_INDEX,
        ethers.constants.AddressZero,
        MIN_TOKEN_REQUESTED,
        MEMO,
      );

    await Promise.all(
      splits.map(async (split) => {
        await expect(tx)
          .to.emit(snowEthPaymentTerminal, 'DistributeToPayoutSplit')
          .withArgs(
            PROJECT_ID,
            /*_fundingCycle.configuration*/ timestamp,
            ETH_PAYOUT_INDEX,
            [
              split.preferClaimed,
              split.preferAddToBalance,
              split.percent,
              split.projectId,
              split.beneficiary,
              split.lockedUntil,
              split.allocator,
            ],
            /*payoutAmount*/ Math.floor((AMOUNT_MINUS_FEES * split.percent) / SPLITS_TOTAL_PERCENT),
            caller.address,
          );
      }),
    );

    expect(await tx)
      .to.emit(snowEthPaymentTerminal, 'DistributePayouts')
      .withArgs(
        /*_fundingCycle.configuration*/ timestamp,
        /*_fundingCycle.number*/ 1,
        PROJECT_ID,
        projectOwner.address,
        /*_amount*/ AMOUNT_TO_DISTRIBUTE,
        /*_distributedAmount*/ AMOUNT_DISTRIBUTED,
        /*_feeAmount*/ FEE_AMOUNT,
        /*_leftoverDistributionAmount*/ 0,
        MEMO,
        caller.address,
      );
  });

  it('Should distribute payout minus non-discounted fee if the fee gauge is faulty', async function () {
    const {
      projectOwner,
      terminalOwner,
      caller,
      beneficiaryOne,
      beneficiaryTwo,
      snowEthPaymentTerminal,
      timestamp,
      mockJbDirectory,
      mockJbEthPaymentTerminal,
      mockJbFeeGauge,
      mockJbSplitsStore,
    } = await setup();

    const AMOUNT_MINUS_FEES = Math.floor((AMOUNT_DISTRIBUTED * MAX_FEE) / (MAX_FEE + DEFAULT_FEE));

    const splits = makeSplits({
      count: 2,
      beneficiary: [beneficiaryOne.address, beneficiaryTwo.address],
    });

    await snowEthPaymentTerminal.connect(terminalOwner).setFeeGauge(mockJbFeeGauge.address);

    await mockJbFeeGauge.mock.currentDiscountFor.withArgs(PROJECT_ID).reverts();

    await mockJbSplitsStore.mock.splitsOf
      .withArgs(PROJECT_ID, timestamp, ETH_PAYOUT_INDEX)
      .returns(splits);

    await mockJbDirectory.mock.primaryTerminalOf
      .withArgs(1, ETH_ADDRESS)
      .returns(mockJbEthPaymentTerminal.address);

    await mockJbEthPaymentTerminal.mock.pay
      .withArgs(
        1, //SNOWX Dao
        AMOUNT_DISTRIBUTED - AMOUNT_MINUS_FEES, // 0 if fee is in ETH (as the amount is then in msg.value)
        ETH_ADDRESS,
        projectOwner.address,
        0,
        false,
        '',
        '0x',
      )
      .returns(0);

    await Promise.all(
      splits.map(async (split) => {
        await mockJbEthPaymentTerminal.mock.pay
          .withArgs(
            1, //SNOWX Dao
            /*payoutAmount*/ Math.floor((AMOUNT_MINUS_FEES * split.percent) / SPLITS_TOTAL_PERCENT),
            ETH_ADDRESS,
            split.beneficiary,
            0,
            split.preferClaimed,
            '',
            '0x',
          )
          .returns(0);
      }),
    );

    let tx = await snowEthPaymentTerminal
      .connect(caller)
      .distributePayoutsOf(
        PROJECT_ID,
        AMOUNT_TO_DISTRIBUTE,
        ETH_PAYOUT_INDEX,
        ethers.constants.AddressZero,
        MIN_TOKEN_REQUESTED,
        MEMO,
      );

    await Promise.all(
      splits.map(async (split) => {
        await expect(tx)
          .to.emit(snowEthPaymentTerminal, 'DistributeToPayoutSplit')
          .withArgs(
            PROJECT_ID,
            /*_fundingCycle.configuration*/ timestamp,
            ETH_PAYOUT_INDEX,
            [
              split.preferClaimed,
              split.preferAddToBalance,
              split.percent,
              split.projectId,
              split.beneficiary,
              split.lockedUntil,
              split.allocator,
            ],
            /*payoutAmount*/ Math.floor((AMOUNT_MINUS_FEES * split.percent) / SPLITS_TOTAL_PERCENT),
            caller.address,
          );
      }),
    );

    expect(await tx)
      .to.emit(snowEthPaymentTerminal, 'DistributePayouts')
      .withArgs(
        /*_fundingCycle.configuration*/ timestamp,
        /*_fundingCycle.number*/ 1,
        PROJECT_ID,
        projectOwner.address,
        /*_amount*/ AMOUNT_TO_DISTRIBUTE,
        /*_distributedAmount*/ AMOUNT_DISTRIBUTED,
        /*_feeAmount*/ AMOUNT_DISTRIBUTED - AMOUNT_MINUS_FEES,
        /*_leftoverDistributionAmount*/ 0,
        MEMO,
        caller.address,
      );
  });

  it('Should distribute payout minus non-discounted fee if the discount is above 100%', async function () {
    const {
      projectOwner,
      terminalOwner,
      caller,
      beneficiaryOne,
      beneficiaryTwo,
      snowEthPaymentTerminal,
      timestamp,
      mockJbDirectory,
      mockJbEthPaymentTerminal,
      mockJbFeeGauge,
      mockJbSplitsStore,
    } = await setup();

    const AMOUNT_MINUS_FEES = Math.floor((AMOUNT_DISTRIBUTED * MAX_FEE) / (MAX_FEE + DEFAULT_FEE));

    const splits = makeSplits({
      count: 2,
      beneficiary: [beneficiaryOne.address, beneficiaryTwo.address],
    });

    await snowEthPaymentTerminal.connect(terminalOwner).setFeeGauge(mockJbFeeGauge.address);

    await mockJbFeeGauge.mock.currentDiscountFor.withArgs(PROJECT_ID).returns(MAX_FEE_DISCOUNT + 1);

    await mockJbSplitsStore.mock.splitsOf
      .withArgs(PROJECT_ID, timestamp, ETH_PAYOUT_INDEX)
      .returns(splits);

    await mockJbDirectory.mock.primaryTerminalOf
      .withArgs(1, ETH_ADDRESS)
      .returns(mockJbEthPaymentTerminal.address);

    await mockJbEthPaymentTerminal.mock.pay
      .withArgs(
        1, //SNOWX Dao
        AMOUNT_DISTRIBUTED - AMOUNT_MINUS_FEES, // 0 if fee is in ETH (as the amount is then in msg.value)
        ETH_ADDRESS,
        projectOwner.address,
        0,
        false,
        '',
        '0x',
      )
      .returns(0);

    await Promise.all(
      splits.map(async (split) => {
        await mockJbEthPaymentTerminal.mock.pay
          .withArgs(
            1, //SNOWX Dao
            /*payoutAmount*/ Math.floor((AMOUNT_MINUS_FEES * split.percent) / SPLITS_TOTAL_PERCENT),
            ETH_ADDRESS,
            split.beneficiary,
            0,
            split.preferClaimed,
            '',
            '0x',
          )
          .returns(0);
      }),
    );

    let tx = await snowEthPaymentTerminal
      .connect(caller)
      .distributePayoutsOf(
        PROJECT_ID,
        AMOUNT_TO_DISTRIBUTE,
        ETH_PAYOUT_INDEX,
        ethers.constants.AddressZero,
        MIN_TOKEN_REQUESTED,
        MEMO,
      );

    await Promise.all(
      splits.map(async (split) => {
        await expect(tx)
          .to.emit(snowEthPaymentTerminal, 'DistributeToPayoutSplit')
          .withArgs(
            PROJECT_ID,
            /*_fundingCycle.configuration*/ timestamp,
            ETH_PAYOUT_INDEX,
            [
              split.preferClaimed,
              split.preferAddToBalance,
              split.percent,
              split.projectId,
              split.beneficiary,
              split.lockedUntil,
              split.allocator,
            ],
            /*payoutAmount*/ Math.floor((AMOUNT_MINUS_FEES * split.percent) / SPLITS_TOTAL_PERCENT),
            caller.address,
          );
      }),
    );

    expect(await tx)
      .to.emit(snowEthPaymentTerminal, 'DistributePayouts')
      .withArgs(
        /*_fundingCycle.configuration*/ timestamp,
        /*_fundingCycle.number*/ 1,
        PROJECT_ID,
        projectOwner.address,
        /*_amount*/ AMOUNT_TO_DISTRIBUTE,
        /*_distributedAmount*/ AMOUNT_DISTRIBUTED,
        /*_feeAmount*/ AMOUNT_DISTRIBUTED - AMOUNT_MINUS_FEES,
        /*_leftoverDistributionAmount*/ 0,
        MEMO,
        caller.address,
      );
  });

  it('Should distribute payout and use the allocator if set in splits', async function () {
    const {
      projectOwner,
      terminalOwner,
      caller,
      snowEthPaymentTerminal,
      timestamp,
      mockJbAllocator,
      mockJbSplitsStore,
    } = await setup();
    const splits = makeSplits({ count: 2, allocator: mockJbAllocator.address });

    await snowEthPaymentTerminal.connect(terminalOwner).setFee(0);

    await mockJbSplitsStore.mock.splitsOf
      .withArgs(PROJECT_ID, timestamp, ETH_PAYOUT_INDEX)
      .returns(splits);

    await Promise.all(
      splits.map(async (split) => {
        await mockJbAllocator.mock.allocate
          .withArgs({
            // SNOWSplitAllocationData
            token: ETH_ADDRESS,
            amount: Math.floor((AMOUNT_DISTRIBUTED * split.percent) / SPLITS_TOTAL_PERCENT),
            decimals: 18,
            projectId: PROJECT_ID,
            group: ETH_PAYOUT_INDEX,
            split,
          })
          .returns();
      }),
    );

    let tx = await snowEthPaymentTerminal
      .connect(caller)
      .distributePayoutsOf(
        PROJECT_ID,
        AMOUNT_TO_DISTRIBUTE,
        ETH_PAYOUT_INDEX,
        ethers.constants.AddressZero,
        MIN_TOKEN_REQUESTED,
        MEMO,
      );

    await Promise.all(
      splits.map(async (split) => {
        await expect(tx)
          .to.emit(snowEthPaymentTerminal, 'DistributeToPayoutSplit')
          .withArgs(
            PROJECT_ID,
            /*_fundingCycle.configuration*/ timestamp,
            ETH_PAYOUT_INDEX,
            [
              split.preferClaimed,
              split.preferAddToBalance,
              split.percent,
              split.projectId,
              split.beneficiary,
              split.lockedUntil,
              split.allocator,
            ],
            /*payoutAmount*/ Math.floor(
              (AMOUNT_DISTRIBUTED * split.percent) / SPLITS_TOTAL_PERCENT,
            ),
            caller.address,
          );
      }),
    );

    expect(await tx)
      .to.emit(snowEthPaymentTerminal, 'DistributePayouts')
      .withArgs(
        /*_fundingCycle.configuration*/ timestamp,
        /*_fundingCycle.number*/ 1,
        PROJECT_ID,
        projectOwner.address,
        /*_amount*/ AMOUNT_TO_DISTRIBUTE,
        /*_distributedAmount*/ AMOUNT_DISTRIBUTED,
        /*_feeAmount*/ 0,
        /*_leftoverDistributionAmount*/ 0,
        MEMO,
        caller.address,
      );
  });

  it('Should distribute payout and use the allocator if set in splits, using a fee discount', async function () {
    const {
      projectOwner,
      terminalOwner,
      caller,
      snowEthPaymentTerminal,
      timestamp,
      mockJbAllocator,
      mockJbFeeGauge,
      mockSNOWPaymentTerminalStore,
      mockJbSplitsStore,
    } = await setup();

    const DISCOUNTED_FEE =
      DEFAULT_FEE - Math.floor((DEFAULT_FEE * FEE_DISCOUNT) / MAX_FEE_DISCOUNT);

    const FEE_AMOUNT =
      AMOUNT_DISTRIBUTED - Math.floor((AMOUNT_DISTRIBUTED * MAX_FEE) / (DISCOUNTED_FEE + MAX_FEE));

    const AMOUNT_MINUS_FEES = AMOUNT_DISTRIBUTED - FEE_AMOUNT;

    const splits = makeSplits({ count: 1, allocator: mockJbAllocator.address });

    fundingCycle = {
      number: 1,
      configuration: timestamp,
      basedOn: timestamp,
      start: timestamp,
      duration: 0,
      weight: 0,
      discountRate: 0,
      ballot: ethers.constants.AddressZero,
      metadata: packFundingCycleMetadata({ holdFees: true }),
    };

    await mockSNOWPaymentTerminalStore.mock.recordDistributionFor
      .withArgs(PROJECT_ID, AMOUNT_TO_DISTRIBUTE, CURRENCY)
      .returns(fundingCycle, AMOUNT_DISTRIBUTED);

    await snowEthPaymentTerminal.connect(terminalOwner).setFeeGauge(mockJbFeeGauge.address);

    await mockJbFeeGauge.mock.currentDiscountFor.withArgs(PROJECT_ID).returns(FEE_DISCOUNT);

    await mockJbSplitsStore.mock.splitsOf
      .withArgs(PROJECT_ID, timestamp, ETH_PAYOUT_INDEX)
      .returns(splits);

    await Promise.all(
      splits.map(async (split) => {
        await mockJbAllocator.mock.allocate
          .withArgs({
            // SNOWSplitAllocationData
            token: ETH_ADDRESS,
            amount: AMOUNT_MINUS_FEES, // One split
            decimals: 18,
            projectId: PROJECT_ID,
            group: ETH_PAYOUT_INDEX,
            split,
          })
          .returns();
      }),
    );

    let tx = await snowEthPaymentTerminal
      .connect(caller)
      .distributePayoutsOf(
        PROJECT_ID,
        AMOUNT_TO_DISTRIBUTE,
        ETH_PAYOUT_INDEX,
        ethers.constants.AddressZero,
        MIN_TOKEN_REQUESTED,
        MEMO,
      );

    await Promise.all(
      splits.map(async (split) => {
        await expect(tx)
          .to.emit(snowEthPaymentTerminal, 'DistributeToPayoutSplit')
          .withArgs(
            PROJECT_ID,
            /*_fundingCycle.configuration*/ timestamp,
            ETH_PAYOUT_INDEX,
            [
              split.preferClaimed,
              split.preferAddToBalance,
              split.percent,
              split.projectId,
              split.beneficiary,
              split.lockedUntil,
              split.allocator,
            ],
            AMOUNT_MINUS_FEES,
            caller.address,
          );
      }),
    );

    expect(await tx)
      .to.emit(snowEthPaymentTerminal, 'DistributePayouts')
      .withArgs(
        /*_fundingCycle.configuration*/ timestamp,
        /*_fundingCycle.number*/ 1,
        PROJECT_ID,
        projectOwner.address,
        /*_amount*/ AMOUNT_TO_DISTRIBUTE,
        /*_distributedAmount*/ AMOUNT_DISTRIBUTED,
        /*_feeAmount*/ FEE_AMOUNT,
        /*_leftoverDistributionAmount*/ 0,
        MEMO,
        caller.address,
      );
  });

  it('Should distribute payout and use the allocator if set in splits without fee if the allocator is feeless', async function () {
    const {
      projectOwner,
      terminalOwner,
      caller,
      snowEthPaymentTerminal,
      timestamp,
      mockJbAllocator,
      mockJbFeeGauge,
      mockSNOWPaymentTerminalStore,
      mockJbSplitsStore,
    } = await setup();

    const splits = makeSplits({ count: 1, allocator: mockJbAllocator.address });

    fundingCycle = {
      number: 1,
      configuration: timestamp,
      basedOn: timestamp,
      start: timestamp,
      duration: 0,
      weight: 0,
      discountRate: 0,
      ballot: ethers.constants.AddressZero,
      metadata: packFundingCycleMetadata({ holdFees: true }),
    };

    await mockSNOWPaymentTerminalStore.mock.recordDistributionFor
      .withArgs(PROJECT_ID, AMOUNT_TO_DISTRIBUTE, CURRENCY)
      .returns(fundingCycle, AMOUNT_DISTRIBUTED);

    await snowEthPaymentTerminal
      .connect(terminalOwner)
      .setFeelessAddress(mockJbAllocator.address, true);

    //await mockJbFeeGauge.mock.currentDiscountFor.withArgs(PROJECT_ID).returns(FEE_DISCOUNT);

    await mockJbSplitsStore.mock.splitsOf
      .withArgs(PROJECT_ID, timestamp, ETH_PAYOUT_INDEX)
      .returns(splits);

    await Promise.all(
      splits.map(async (split) => {
        await mockJbAllocator.mock.allocate
          .withArgs({
            // SNOWSplitAllocationData
            token: ETH_ADDRESS,
            amount: AMOUNT_DISTRIBUTED, // One split
            decimals: 18,
            projectId: PROJECT_ID,
            group: ETH_PAYOUT_INDEX,
            split,
          })
          .returns();
      }),
    );

    let tx = await snowEthPaymentTerminal
      .connect(caller)
      .distributePayoutsOf(
        PROJECT_ID,
        AMOUNT_TO_DISTRIBUTE,
        ETH_PAYOUT_INDEX,
        ethers.constants.AddressZero,
        MIN_TOKEN_REQUESTED,
        MEMO,
      );

    await Promise.all(
      splits.map(async (split) => {
        await expect(tx)
          .to.emit(snowEthPaymentTerminal, 'DistributeToPayoutSplit')
          .withArgs(
            PROJECT_ID,
            /*_fundingCycle.configuration*/ timestamp,
            ETH_PAYOUT_INDEX,
            [
              split.preferClaimed,
              split.preferAddToBalance,
              split.percent,
              split.projectId,
              split.beneficiary,
              split.lockedUntil,
              split.allocator,
            ],
            AMOUNT_DISTRIBUTED,
            caller.address,
          );
      }),
    );

    expect(await tx)
      .to.emit(snowEthPaymentTerminal, 'DistributePayouts')
      .withArgs(
        /*_fundingCycle.configuration*/ timestamp,
        /*_fundingCycle.number*/ 1,
        PROJECT_ID,
        projectOwner.address,
        /*_amount*/ AMOUNT_TO_DISTRIBUTE,
        /*_distributedAmount*/ AMOUNT_DISTRIBUTED,
        /*_feeAmount*/ 0,
        /*_leftoverDistributionAmount*/ 0,
        MEMO,
        caller.address,
      );
  });

  it('Should distribute payout and use the allocator if set in splits, using a non-eth token', async function () {
    const {
      projectOwner,
      terminalOwner,
      caller,
      snowErc20PaymentTerminal,
      timestamp,
      mockJbAllocator,
      mockJbSplitsStore,
      fakeToken,
    } = await setup();
    const splits = makeSplits({ count: 2, allocator: mockJbAllocator.address });

    await snowErc20PaymentTerminal.connect(terminalOwner).setFee(0);

    await mockJbSplitsStore.mock.splitsOf
      .withArgs(PROJECT_ID, timestamp, ETH_PAYOUT_INDEX)
      .returns(splits);

    await Promise.all(
      splits.map(async (split) => {
        await fakeToken.mock.approve
          .withArgs(
            mockJbAllocator.address,
            Math.floor((AMOUNT_DISTRIBUTED * split.percent) / SPLITS_TOTAL_PERCENT),
          )
          .returns(true);

        await mockJbAllocator.mock.allocate
          .withArgs({
            // SNOWSplitAllocationData
            token: fakeToken.address,
            amount: Math.floor((AMOUNT_DISTRIBUTED * split.percent) / SPLITS_TOTAL_PERCENT),
            decimals: 18,
            projectId: PROJECT_ID,
            group: ETH_PAYOUT_INDEX,
            split,
          })
          .returns();
      }),
    );

    let tx = await snowErc20PaymentTerminal
      .connect(caller)
      .distributePayoutsOf(
        PROJECT_ID,
        AMOUNT_TO_DISTRIBUTE,
        ETH_PAYOUT_INDEX,
        ethers.constants.AddressZero,
        MIN_TOKEN_REQUESTED,
        MEMO,
      );

    await Promise.all(
      splits.map(async (split) => {
        await expect(tx)
          .to.emit(snowErc20PaymentTerminal, 'DistributeToPayoutSplit')
          .withArgs(
            PROJECT_ID,
            /*_fundingCycle.configuration*/ timestamp,
            ETH_PAYOUT_INDEX,
            [
              split.preferClaimed,
              split.preferAddToBalance,
              split.percent,
              split.projectId,
              split.beneficiary,
              split.lockedUntil,
              split.allocator,
            ],
            /*payoutAmount*/ Math.floor(
              (AMOUNT_DISTRIBUTED * split.percent) / SPLITS_TOTAL_PERCENT,
            ),
            caller.address,
          );
      }),
    );

    expect(await tx)
      .to.emit(snowErc20PaymentTerminal, 'DistributePayouts')
      .withArgs(
        /*_fundingCycle.configuration*/ timestamp,
        /*_fundingCycle.number*/ 1,
        PROJECT_ID,
        projectOwner.address,
        /*_amount*/ AMOUNT_TO_DISTRIBUTE,
        /*_distributedAmount*/ AMOUNT_DISTRIBUTED,
        /*_feeAmount*/ 0,
        /*_leftoverDistributionAmount*/ 0,
        MEMO,
        caller.address,
      );
  });

  it('Should distribute payout to the caller if no beneficiary, allocator or project id is set in split', async function () {
    const {
      projectOwner,
      terminalOwner,
      caller,
      snowEthPaymentTerminal,
      timestamp,
      mockJbSplitsStore,
    } = await setup();
    const splits = makeSplits({
      count: 2,
    });

    await snowEthPaymentTerminal.connect(terminalOwner).setFee(0);

    await mockJbSplitsStore.mock.splitsOf
      .withArgs(PROJECT_ID, timestamp, ETH_PAYOUT_INDEX)
      .returns(splits);

    let tx = await snowEthPaymentTerminal
      .connect(caller)
      .distributePayoutsOf(
        PROJECT_ID,
        AMOUNT_TO_DISTRIBUTE,
        ETH_PAYOUT_INDEX,
        ethers.constants.AddressZero,
        MIN_TOKEN_REQUESTED,
        MEMO,
      );

    await Promise.all(
      splits.map(async (split) => {
        await expect(tx)
          .to.emit(snowEthPaymentTerminal, 'DistributeToPayoutSplit')
          .withArgs(
            PROJECT_ID,
            /*_fundingCycle.configuration*/ timestamp,
            ETH_PAYOUT_INDEX,
            [
              split.preferClaimed,
              split.preferAddToBalance,
              split.percent,
              split.projectId,
              split.beneficiary,
              split.lockedUntil,
              split.allocator,
            ],
            /*payoutAmount*/ Math.floor(
              (AMOUNT_DISTRIBUTED * split.percent) / SPLITS_TOTAL_PERCENT,
            ),
            caller.address,
          );
      }),
    );

    expect(await tx)
      .to.emit(snowEthPaymentTerminal, 'DistributePayouts')
      .withArgs(
        timestamp,
        /*_fundingCycle.number*/ 1,
        PROJECT_ID,
        projectOwner.address,
        /*amount*/ AMOUNT_TO_DISTRIBUTE,
        /*distributedAmount*/ AMOUNT_DISTRIBUTED,
        /*_feeAmount*/ 0,
        /*_leftoverDistributionAmount*/ 0,
        MEMO,
        caller.address,
      );

    expect(await tx).to.changeEtherBalance(caller, AMOUNT_DISTRIBUTED);
  });

  it('Should distribute payout and use the terminal of the project if project id and beneficiary are set in splits', async function () {
    const {
      projectOwner,
      terminalOwner,
      caller,
      snowEthPaymentTerminal,
      timestamp,
      mockJbDirectory,
      mockJbEthPaymentTerminal,
      mockJbSplitsStore,
      beneficiaryOne,
    } = await setup();
    const splits = makeSplits({
      count: 2,
      projectId: OTHER_PROJECT_ID,
      beneficiary: [beneficiaryOne.address, beneficiaryOne.address],
    });

    await snowEthPaymentTerminal.connect(terminalOwner).setFee(0);

    await mockJbDirectory.mock.primaryTerminalOf
      .withArgs(OTHER_PROJECT_ID, ETH_ADDRESS)
      .returns(mockJbEthPaymentTerminal.address);

    await mockJbSplitsStore.mock.splitsOf
      .withArgs(PROJECT_ID, timestamp, ETH_PAYOUT_INDEX)
      .returns(splits);

    await Promise.all(
      splits.map(async (split) => {
        await mockJbEthPaymentTerminal.mock.pay
          .withArgs(
            split.projectId,
            /*payoutAmount*/ Math.floor(
              (AMOUNT_DISTRIBUTED * split.percent) / SPLITS_TOTAL_PERCENT,
            ),
            ETH_ADDRESS,
            split.beneficiary,
            /*minReturnedToken*/ 0,
            split.preferClaimed,
            '',
            ethers.utils.hexZeroPad(ethers.utils.hexlify(PROJECT_ID), 32),
          )
          .returns(0);
      }),
    );

    let tx = await snowEthPaymentTerminal
      .connect(caller)
      .distributePayoutsOf(
        PROJECT_ID,
        AMOUNT_TO_DISTRIBUTE,
        ETH_PAYOUT_INDEX,
        ethers.constants.AddressZero,
        MIN_TOKEN_REQUESTED,
        MEMO,
      );

    await Promise.all(
      splits.map(async (split) => {
        await expect(tx)
          .to.emit(snowEthPaymentTerminal, 'DistributeToPayoutSplit')
          .withArgs(
            PROJECT_ID,
            /*_fundingCycle.configuration*/ timestamp,
            ETH_PAYOUT_INDEX,
            [
              split.preferClaimed,
              split.preferAddToBalance,
              split.percent,
              split.projectId,
              split.beneficiary,
              split.lockedUntil,
              split.allocator,
            ],
            /*payoutAmount*/ Math.floor(
              (AMOUNT_DISTRIBUTED * split.percent) / SPLITS_TOTAL_PERCENT,
            ),
            caller.address,
          );
      }),
    );

    expect(await tx)
      .to.emit(snowEthPaymentTerminal, 'DistributePayouts')
      .withArgs(
        /*_fundingCycle.configuration*/ timestamp,
        /*_fundingCycle.number*/ 1,
        PROJECT_ID,
        projectOwner.address,
        /*_amount*/ AMOUNT_TO_DISTRIBUTE,
        /*_distributedAmount*/ AMOUNT_DISTRIBUTED,
        /*_feeAmount*/ 0,
        /*_leftoverDistributionAmount*/ 0,
        MEMO,
        caller.address,
      );
  });

  it('Should distribute payout using a fee discount and use the terminal of the project if project id is set in splits', async function () {
    const {
      projectOwner,
      terminalOwner,
      caller,
      snowEthPaymentTerminal,
      timestamp,
      mockJbDirectory,
      mockJbEthPaymentTerminal,
      mockJbFeeGauge,
      mockJbSplitsStore,
      mockSNOWPaymentTerminalStore,
    } = await setup();
    const DISCOUNTED_FEE =
      DEFAULT_FEE - Math.floor((DEFAULT_FEE * FEE_DISCOUNT) / MAX_FEE_DISCOUNT);

    const FEE_AMOUNT =
      AMOUNT_DISTRIBUTED - Math.floor((AMOUNT_DISTRIBUTED * MAX_FEE) / (DISCOUNTED_FEE + MAX_FEE));

    const AMOUNT_MINUS_FEES = AMOUNT_DISTRIBUTED - FEE_AMOUNT;

    await snowEthPaymentTerminal.connect(terminalOwner).setFeeGauge(mockJbFeeGauge.address);

    await mockJbFeeGauge.mock.currentDiscountFor.withArgs(PROJECT_ID).returns(FEE_DISCOUNT);

    const splits = makeSplits({ count: 1, projectId: OTHER_PROJECT_ID, preferAddToBalance: true });

    await mockJbDirectory.mock.primaryTerminalOf
      .withArgs(OTHER_PROJECT_ID, ETH_ADDRESS)
      .returns(mockJbEthPaymentTerminal.address);

    await mockJbSplitsStore.mock.splitsOf
      .withArgs(PROJECT_ID, timestamp, ETH_PAYOUT_INDEX)
      .returns(splits);

    fundingCycle = {
      number: 1,
      configuration: timestamp,
      basedOn: timestamp,
      start: timestamp,
      duration: 0,
      weight: 0,
      discountRate: 0,
      ballot: ethers.constants.AddressZero,
      metadata: packFundingCycleMetadata({ holdFees: true }),
    };

    await mockSNOWPaymentTerminalStore.mock.recordDistributionFor
      .withArgs(PROJECT_ID, AMOUNT_TO_DISTRIBUTE, CURRENCY)
      .returns(fundingCycle, AMOUNT_DISTRIBUTED);

    await Promise.all(
      splits.map(async (split) => {
        await mockJbEthPaymentTerminal.mock.addToBalanceOf
          .withArgs(
            split.projectId,
            AMOUNT_MINUS_FEES,
            ETH_ADDRESS,
            '',
            ethers.utils.hexZeroPad(ethers.utils.hexlify(PROJECT_ID), 32),
          )
          .returns();
      }),
    );

    let tx = await snowEthPaymentTerminal
      .connect(caller)
      .distributePayoutsOf(
        PROJECT_ID,
        AMOUNT_TO_DISTRIBUTE,
        ETH_PAYOUT_INDEX,
        ethers.constants.AddressZero,
        MIN_TOKEN_REQUESTED,
        MEMO,
      );

    await Promise.all(
      splits.map(async (split) => {
        await expect(tx)
          .to.emit(snowEthPaymentTerminal, 'DistributeToPayoutSplit')
          .withArgs(
            PROJECT_ID,
            /*_fundingCycle.configuration*/ timestamp,
            ETH_PAYOUT_INDEX,
            [
              split.preferClaimed,
              split.preferAddToBalance,
              split.percent,
              split.projectId,
              split.beneficiary,
              split.lockedUntil,
              split.allocator,
            ],
            /*payoutAmount*/ Math.floor((AMOUNT_MINUS_FEES * split.percent) / SPLITS_TOTAL_PERCENT),
            caller.address,
          );
      }),
    );

    expect(await tx)
      .to.emit(snowEthPaymentTerminal, 'DistributePayouts')
      .withArgs(
        /*_fundingCycle.configuration*/ timestamp,
        /*_fundingCycle.number*/ 1,
        PROJECT_ID,
        projectOwner.address,
        /*_amount*/ AMOUNT_TO_DISTRIBUTE,
        /*_distributedAmount*/ AMOUNT_DISTRIBUTED,
        /*_feeAmount*/ FEE_AMOUNT,
        /*_leftoverDistributionAmount*/ 0,
        MEMO,
        caller.address,
      );
  });

  it('Should distribute payout and use the terminal of the project if project id is set in splits, for non-eth token', async function () {
    const {
      projectOwner,
      caller,
      snowErc20PaymentTerminal,
      timestamp,
      mockJbDirectory,
      mockJbEthPaymentTerminal,
      mockSNOWPaymentTerminalStore,
      mockJbSplitsStore,
      fakeToken,
      CURRENCY_USD,
    } = await setup();

    const FEE_AMOUNT =
      AMOUNT_DISTRIBUTED - Math.floor((AMOUNT_DISTRIBUTED * MAX_FEE) / (DEFAULT_FEE + MAX_FEE));

    const AMOUNT_MINUS_FEES = AMOUNT_DISTRIBUTED - FEE_AMOUNT;

    const splits = makeSplits({ count: 2, projectId: OTHER_PROJECT_ID, preferAddToBalance: true });

    fundingCycle = {
      number: 1,
      configuration: timestamp,
      basedOn: timestamp,
      start: timestamp,
      duration: 0,
      weight: 0,
      discountRate: 0,
      ballot: ethers.constants.AddressZero,
      metadata: packFundingCycleMetadata(),
    };

    await mockSNOWPaymentTerminalStore.mock.recordDistributionFor
      .withArgs(PROJECT_ID, AMOUNT_TO_DISTRIBUTE, CURRENCY)
      .returns(fundingCycle, AMOUNT_DISTRIBUTED);

    await mockJbDirectory.mock.primaryTerminalOf
      .withArgs(OTHER_PROJECT_ID, fakeToken.address)
      .returns(mockJbEthPaymentTerminal.address);

    // Protocol project accept the token as fee
    await mockJbDirectory.mock.primaryTerminalOf
      .withArgs(1, fakeToken.address)
      .returns(mockJbEthPaymentTerminal.address);

    await mockJbSplitsStore.mock.splitsOf
      .withArgs(PROJECT_ID, timestamp, ETH_PAYOUT_INDEX)
      .returns(splits);

    await Promise.all(
      splits.map(async (split) => {
        await fakeToken.mock.approve
          .withArgs(
            mockJbEthPaymentTerminal.address,
            Math.floor((AMOUNT_MINUS_FEES * split.percent) / SPLITS_TOTAL_PERCENT),
          )
          .returns(true);

        await mockJbEthPaymentTerminal.mock.addToBalanceOf
          .withArgs(
            split.projectId,
            /*payoutAmount*/ Math.floor((AMOUNT_MINUS_FEES * split.percent) / SPLITS_TOTAL_PERCENT),
            fakeToken.address,
            '',
            ethers.utils.hexZeroPad(ethers.utils.hexlify(PROJECT_ID), 32),
          )
          .returns();
      }),
    );

    // Fee
    await mockJbEthPaymentTerminal.mock.pay
      .withArgs(
        1,
        FEE_AMOUNT,
        fakeToken.address,
        projectOwner.address,
        /*minReturnedToken*/ 0,
        false,
        '',
        '0x',
      )
      .returns(0);

    await fakeToken.mock.approve
      .withArgs(mockJbEthPaymentTerminal.address, FEE_AMOUNT)
      .returns(true);

    let tx = await snowErc20PaymentTerminal
      .connect(caller)
      .distributePayoutsOf(
        PROJECT_ID,
        AMOUNT_TO_DISTRIBUTE,
        ETH_PAYOUT_INDEX,
        ethers.constants.AddressZero,
        MIN_TOKEN_REQUESTED,
        MEMO,
      );

    await Promise.all(
      splits.map(async (split) => {
        await expect(tx)
          .to.emit(snowErc20PaymentTerminal, 'DistributeToPayoutSplit')
          .withArgs(
            PROJECT_ID,
            /*_fundingCycle.configuration*/ timestamp,
            ETH_PAYOUT_INDEX,
            [
              split.preferClaimed,
              split.preferAddToBalance,
              split.percent,
              split.projectId,
              split.beneficiary,
              split.lockedUntil,
              split.allocator,
            ],
            /*payoutAmount*/ Math.floor((AMOUNT_MINUS_FEES * split.percent) / SPLITS_TOTAL_PERCENT),
            caller.address,
          );
      }),
    );

    expect(await tx)
      .to.emit(snowErc20PaymentTerminal, 'DistributePayouts')
      .withArgs(
        /*_fundingCycle.configuration*/ timestamp,
        /*_fundingCycle.number*/ 1,
        PROJECT_ID,
        projectOwner.address,
        /*_amount*/ AMOUNT_TO_DISTRIBUTE,
        /*_distributedAmount*/ AMOUNT_DISTRIBUTED,
        /*_feeAmount*/ FEE_AMOUNT,
        /*_leftoverDistributionAmount*/ 0,
        MEMO,
        caller.address,
      );
  });

  it('Should distribute payout and use this terminal if the project set in splits uses it', async function () {
    const {
      projectOwner,
      terminalOwner,
      caller,
      beneficiaryOne,
      beneficiaryTwo,
      snowEthPaymentTerminal,
      timestamp,
      mockJbDirectory,
      mockSNOWPaymentTerminalStore,
      mockJbSplitsStore,
    } = await setup();
    const splits = makeSplits({
      count: 2,
      projectId: OTHER_PROJECT_ID,
      beneficiary: [beneficiaryOne.address, beneficiaryTwo.address],
    });

    await snowEthPaymentTerminal.connect(terminalOwner).setFee(0);

    await mockJbDirectory.mock.primaryTerminalOf
      .withArgs(OTHER_PROJECT_ID, ETH_ADDRESS)
      .returns(snowEthPaymentTerminal.address);

    await mockJbSplitsStore.mock.splitsOf
      .withArgs(PROJECT_ID, timestamp, ETH_PAYOUT_INDEX)
      .returns(splits);

    await Promise.all(
      splits.map(async (split) => {
        await mockSNOWPaymentTerminalStore.mock.recordPaymentFrom
          .withArgs(
            snowEthPaymentTerminal.address,
            [
              /*token*/ '0x000000000000000000000000000000000000eeee',
              /*amount paid*/ Math.floor(
              (AMOUNT_DISTRIBUTED * split.percent) / SPLITS_TOTAL_PERCENT,
            ),
              /*decimal*/ 18,
              CURRENCY,
            ],
            split.projectId,
            CURRENCY,
            split.beneficiary,
            '',
            ethers.utils.hexZeroPad(ethers.utils.hexlify(PROJECT_ID), 32),
          )
          .returns(fundingCycle, 0, /* delegate */ ethers.constants.AddressZero, '');
      }),
    );

    let tx = await snowEthPaymentTerminal
      .connect(caller)
      .distributePayoutsOf(
        PROJECT_ID,
        AMOUNT_TO_DISTRIBUTE,
        ETH_PAYOUT_INDEX,
        ethers.constants.AddressZero,
        MIN_TOKEN_REQUESTED,
        MEMO,
      );

    await Promise.all(
      splits.map(async (split) => {
        await expect(tx)
          .to.emit(snowEthPaymentTerminal, 'DistributeToPayoutSplit')
          .withArgs(
            PROJECT_ID,
            /*_fundingCycle.configuration*/ timestamp,
            ETH_PAYOUT_INDEX,
            [
              split.preferClaimed,
              split.preferAddToBalance,
              split.percent,
              split.projectId,
              split.beneficiary,
              split.lockedUntil,
              split.allocator,
            ],
            /*payoutAmount*/ Math.floor(
              (AMOUNT_DISTRIBUTED * split.percent) / SPLITS_TOTAL_PERCENT,
            ),
            caller.address,
          )
          .and.to.emit(snowEthPaymentTerminal, 'Pay')
          .withArgs(
            timestamp,
            1,
            split.projectId,
            snowEthPaymentTerminal.address,
            split.beneficiary,
            Math.floor((AMOUNT_DISTRIBUTED * split.percent) / SPLITS_TOTAL_PERCENT),
            0,
            '',
            ethers.utils.hexZeroPad(ethers.utils.hexlify(PROJECT_ID), 32),
            caller.address,
          );
      }),
    );

    expect(await tx)
      .to.emit(snowEthPaymentTerminal, 'DistributePayouts')
      .withArgs(
        /*_fundingCycle.configuration*/ timestamp,
        /*_fundingCycle.number*/ 1,
        PROJECT_ID,
        projectOwner.address,
        /*_amount*/ AMOUNT_TO_DISTRIBUTE,
        /*_distributedAmount*/ AMOUNT_DISTRIBUTED,
        /*_feeAmount*/ 0,
        /*_leftoverDistributionAmount*/ 0,
        MEMO,
        caller.address,
      );
  });

  it('Should distribute payout and use this terminal if the project set in splits uses it, with no beneficairies', async function () {
    const {
      projectOwner,
      terminalOwner,
      caller,
      snowEthPaymentTerminal,
      timestamp,
      mockJbDirectory,
      mockSNOWPaymentTerminalStore,
      mockJbSplitsStore,
    } = await setup();
    const splits = makeSplits({
      count: 2,
      projectId: OTHER_PROJECT_ID,
      preferAddToBalance: true,
    });

    await snowEthPaymentTerminal.connect(terminalOwner).setFee(0);

    await mockJbDirectory.mock.primaryTerminalOf
      .withArgs(OTHER_PROJECT_ID, ETH_ADDRESS)
      .returns(snowEthPaymentTerminal.address);

    await mockJbSplitsStore.mock.splitsOf
      .withArgs(PROJECT_ID, timestamp, ETH_PAYOUT_INDEX)
      .returns(splits);

    await Promise.all(
      splits.map(async (split) => {
        await mockSNOWPaymentTerminalStore.mock.recordAddedBalanceFor
          .withArgs(
            split.projectId,
            /*amount paid*/ Math.floor((AMOUNT_DISTRIBUTED * split.percent) / SPLITS_TOTAL_PERCENT),
          )
          .returns();
      }),
    );

    let tx = await snowEthPaymentTerminal
      .connect(caller)
      .distributePayoutsOf(
        PROJECT_ID,
        AMOUNT_TO_DISTRIBUTE,
        ETH_PAYOUT_INDEX,
        ethers.constants.AddressZero,
        MIN_TOKEN_REQUESTED,
        MEMO,
      );

    await Promise.all(
      splits.map(async (split) => {
        await expect(tx)
          .to.emit(snowEthPaymentTerminal, 'DistributeToPayoutSplit')
          .withArgs(
            PROJECT_ID,
            /*_fundingCycle.configuration*/ timestamp,
            ETH_PAYOUT_INDEX,
            [
              split.preferClaimed,
              split.preferAddToBalance,
              split.percent,
              split.projectId,
              split.beneficiary,
              split.lockedUntil,
              split.allocator,
            ],
            /*payoutAmount*/ Math.floor(
              (AMOUNT_DISTRIBUTED * split.percent) / SPLITS_TOTAL_PERCENT,
            ),
            caller.address,
          )
          .and.to.emit(snowEthPaymentTerminal, 'AddToBalance')
          .withArgs(
            split.projectId,
            Math.floor((AMOUNT_DISTRIBUTED * split.percent) / SPLITS_TOTAL_PERCENT),
            0,
            '',
            ethers.utils.hexZeroPad(ethers.utils.hexlify(PROJECT_ID), 32),
            caller.address,
          );
      }),
    );

    expect(await tx)
      .to.emit(snowEthPaymentTerminal, 'DistributePayouts')
      .withArgs(
        /*_fundingCycle.configuration*/ timestamp,
        /*_fundingCycle.number*/ 1,
        PROJECT_ID,
        projectOwner.address,
        /*_amount*/ AMOUNT_TO_DISTRIBUTE,
        /*_distributedAmount*/ AMOUNT_DISTRIBUTED,
        /*_feeAmount*/ 0,
        /*_leftoverDistributionAmount*/ 0,
        MEMO,
        caller.address,
      );
  });

  it('Should send any leftover after distributing to the projectOwner', async function () {
    const {
      projectOwner,
      terminalOwner,
      caller,
      beneficiaryOne,
      beneficiaryTwo,
      snowEthPaymentTerminal,
      timestamp,
      mockJbSplitsStore,
    } = await setup();
    const PERCENT = SPLITS_TOTAL_PERCENT / 10;
    const splits = makeSplits({
      count: 2,
      beneficiary: [beneficiaryOne.address, beneficiaryTwo.address],
      percent: PERCENT,
    });

    await snowEthPaymentTerminal.connect(terminalOwner).setFee(0);

    await mockJbSplitsStore.mock.splitsOf
      .withArgs(PROJECT_ID, timestamp, ETH_PAYOUT_INDEX)
      .returns(splits);

    let tx = await snowEthPaymentTerminal
      .connect(caller)
      .distributePayoutsOf(
        PROJECT_ID,
        AMOUNT_TO_DISTRIBUTE,
        ETH_PAYOUT_INDEX,
        ethers.constants.AddressZero,
        MIN_TOKEN_REQUESTED,
        MEMO,
      );

    await Promise.all(
      splits.map(async (split) => {
        await expect(tx)
          .to.emit(snowEthPaymentTerminal, 'DistributeToPayoutSplit')
          .withArgs(
            PROJECT_ID,
            /*_fundingCycle.configuration*/ timestamp,
            ETH_PAYOUT_INDEX,
            [
              split.preferClaimed,
              split.preferAddToBalance,
              split.percent,
              split.projectId,
              split.beneficiary,
              split.lockedUntil,
              split.allocator,
            ],
            /*payoutAmount*/ Math.floor(
              (AMOUNT_DISTRIBUTED * split.percent) / SPLITS_TOTAL_PERCENT,
            ),
            caller.address,
          );
      }),
    );

    expect(await tx)
      .to.emit(snowEthPaymentTerminal, 'DistributePayouts')
      .withArgs(
        /*_fundingCycle.configuration*/ timestamp,
        /*_fundingCycle.number*/ 1,
        PROJECT_ID,
        projectOwner.address,
        /*_amount*/ AMOUNT_TO_DISTRIBUTE,
        /*_distributedAmount*/ AMOUNT_DISTRIBUTED,
        /*_feeAmount*/ 0,
        /*_leftoverDistributionAmount*/ AMOUNT_DISTRIBUTED -
        ((AMOUNT_DISTRIBUTED * PERCENT) / SPLITS_TOTAL_PERCENT) * splits.length,
        MEMO,
        caller.address,
      );
  });

  it('Should distribute payout of 0 and emit event', async function () {
    const {
      projectOwner,
      caller,
      beneficiaryOne,
      beneficiaryTwo,
      snowEthPaymentTerminal,
      timestamp,
      mockSNOWPaymentTerminalStore,
      mockJbSplitsStore,
    } = await setup();
    const splits = makeSplits({
      count: 2,
      beneficiary: [beneficiaryOne.address, beneficiaryTwo.address],
    });

    await mockJbSplitsStore.mock.splitsOf
      .withArgs(PROJECT_ID, timestamp, ETH_PAYOUT_INDEX)
      .returns(splits);

    await mockSNOWPaymentTerminalStore.mock.recordDistributionFor
      .withArgs(PROJECT_ID, AMOUNT_TO_DISTRIBUTE, CURRENCY)
      .returns(fundingCycle, 0);

    let tx = await snowEthPaymentTerminal
      .connect(caller)
      .distributePayoutsOf(
        PROJECT_ID,
        AMOUNT_TO_DISTRIBUTE,
        ETH_PAYOUT_INDEX,
        ethers.constants.AddressZero,
        0,
        MEMO,
      );

    await Promise.all(
      splits.map(async (split) => {
        await expect(tx)
          .to.emit(snowEthPaymentTerminal, 'DistributeToPayoutSplit')
          .withArgs(
            PROJECT_ID,
            /*_fundingCycle.configuration*/ timestamp,
            ETH_PAYOUT_INDEX,
            [
              split.preferClaimed,
              split.preferAddToBalance,
              split.percent,
              split.projectId,
              split.beneficiary,
              split.lockedUntil,
              split.allocator,
            ],
            /*payoutAmount*/ Math.floor((0 * split.percent) / SPLITS_TOTAL_PERCENT),
            caller.address,
          );
      }),
    );

    expect(await tx)
      .to.emit(snowEthPaymentTerminal, 'DistributePayouts')
      .withArgs(
        /*_fundingCycle.configuration*/ timestamp,
        /*_fundingCycle.number*/ 1,
        PROJECT_ID,
        projectOwner.address,
        /*_amount*/ AMOUNT_TO_DISTRIBUTE,
        /*_distributedAmount*/ 0,
        /*_feeAmount*/ 0,
        /*_leftoverDistributionAmount*/ 0,
        MEMO,
        caller.address,
      );
  });

  it('Should distribute payout in ERC20 token and emit event', async function () {
    const {
      projectOwner,
      caller,
      CURRENCY_USD,
      beneficiaryOne,
      beneficiaryTwo,
      fakeToken,
      snowErc20PaymentTerminal,
      terminalOwner,
      timestamp,
      mockJbDirectory,
      mockSNOWPaymentTerminalStore,
      mockJbSplitsStore,
    } = await setup();
    const splits = makeSplits({
      count: 2,
      beneficiary: [beneficiaryOne.address, beneficiaryTwo.address],
    });

    await snowErc20PaymentTerminal.connect(terminalOwner).setFee(0);

    await mockJbSplitsStore.mock.splitsOf
      .withArgs(PROJECT_ID, timestamp, ETH_PAYOUT_INDEX)
      .returns(splits);

    await mockSNOWPaymentTerminalStore.mock.recordDistributionFor
      .withArgs(PROJECT_ID, AMOUNT_TO_DISTRIBUTE, CURRENCY)
      .returns(fundingCycle, AMOUNT_TO_DISTRIBUTE);

    await Promise.all(
      splits.map(async (split) => {
        await fakeToken.mock.transfer
          .withArgs(
            split.beneficiary,
            Math.floor((AMOUNT_TO_DISTRIBUTE * split.percent) / SPLITS_TOTAL_PERCENT),
          )
          .returns(true);
      }),
    );

    let tx = await snowErc20PaymentTerminal
      .connect(caller)
      .distributePayoutsOf(
        PROJECT_ID,
        AMOUNT_TO_DISTRIBUTE,
        ETH_PAYOUT_INDEX,
        ethers.constants.AddressZero,
        AMOUNT_TO_DISTRIBUTE,
        MEMO,
      );

    await Promise.all(
      splits.map(async (split) => {
        await expect(tx)
          .to.emit(snowErc20PaymentTerminal, 'DistributeToPayoutSplit')
          .withArgs(
            PROJECT_ID,
            /*_fundingCycle.configuration*/ timestamp,
            ETH_PAYOUT_INDEX,
            [
              split.preferClaimed,
              split.preferAddToBalance,
              split.percent,
              split.projectId,
              split.beneficiary,
              split.lockedUntil,
              split.allocator,
            ],
            /*payoutAmount*/ Math.floor(
              (AMOUNT_TO_DISTRIBUTE * split.percent) / SPLITS_TOTAL_PERCENT,
            ),
            caller.address,
          );
      }),
    );

    expect(await tx)
      .to.emit(snowErc20PaymentTerminal, 'DistributePayouts')
      .withArgs(
        /*_fundingCycle.configuration*/ timestamp,
        /*_fundingCycle.number*/ 1,
        PROJECT_ID,
        projectOwner.address,
        /*_amount*/ AMOUNT_TO_DISTRIBUTE,
        /*_distributedAmount*/ AMOUNT_TO_DISTRIBUTE,
        /*_feeAmount*/ 0,
        /*_leftoverDistributionAmount*/ 0,
        MEMO,
        caller.address,
      );
  });

  it('Cannot have a zero address terminal for a project set in split', async function () {
    const {
      terminalOwner,
      caller,
      snowEthPaymentTerminal,
      timestamp,
      mockJbDirectory,
      mockJbEthPaymentTerminal,
      mockJbSplitsStore,
    } = await setup();
    const splits = makeSplits({ count: 2, projectId: OTHER_PROJECT_ID });

    await snowEthPaymentTerminal.connect(terminalOwner).setFee(0);

    await mockJbDirectory.mock.primaryTerminalOf
      .withArgs(OTHER_PROJECT_ID, ETH_ADDRESS)
      .returns(ethers.constants.AddressZero);

    await mockJbSplitsStore.mock.splitsOf
      .withArgs(PROJECT_ID, timestamp, ETH_PAYOUT_INDEX)
      .returns(splits);

    await Promise.all(
      splits.map(async (split) => {
        await mockJbEthPaymentTerminal.mock.pay
          .withArgs(
            split.projectId,
            0,
            ETH_ADDRESS,
            split.beneficiary,
            0,
            split.preferClaimed,
            '',
            '0x',
          )
          .returns(0);
      }),
    );

    await expect(
      snowEthPaymentTerminal
        .connect(caller)
        .distributePayoutsOf(
          PROJECT_ID,
          AMOUNT_TO_DISTRIBUTE,
          ETH_PAYOUT_INDEX,
          ethers.constants.AddressZero,
          MIN_TOKEN_REQUESTED,
          MEMO,
        ),
    ).to.be.revertedWith(errors.TERMINAL_IN_SPLIT_ZERO_ADDRESS);
  });

  it('Cannot distribute payouts of the distributed amount is less than expected', async function () {
    const {
      terminalOwner,
      caller,
      beneficiaryOne,
      beneficiaryTwo,
      snowEthPaymentTerminal,
      timestamp,
      mockJbSplitsStore,
    } = await setup();
    const splits = makeSplits({
      count: 2,
      beneficiary: [beneficiaryOne.address, beneficiaryTwo.address],
    });

    await snowEthPaymentTerminal.connect(terminalOwner).setFee(0);

    await mockJbSplitsStore.mock.splitsOf
      .withArgs(PROJECT_ID, timestamp, ETH_PAYOUT_INDEX)
      .returns(splits);

    await expect(
      snowEthPaymentTerminal
        .connect(caller)
        .distributePayoutsOf(
          PROJECT_ID,
          AMOUNT_TO_DISTRIBUTE,
          ETH_PAYOUT_INDEX,
          ethers.constants.AddressZero,
          AMOUNT_DISTRIBUTED + 1,
          MEMO,
        ),
    ).to.be.revertedWith(errors.INADEQUATE_DISTRIBUTION_AMOUNT);
  });
});
