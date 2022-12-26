import { expect } from 'chai';
import { ethers } from 'hardhat';
import { deployMockContract } from '@ethereum-waffle/mock-contract';
import { packFundingCycleMetadata } from '../../helpers/utils.js';
import errors from '../../helpers/errors.json';
import snowDirectory from '../../../artifacts/contracts/SNOWDirectory.sol/SNOWDirectory.json';
import snowController from '../../../artifacts/contracts/interfaces/ISNOWController.sol/ISNOWController.json';
import snowPaymentTerminalStore from '../../../artifacts/contracts/SNOWSingleTokenPaymentTerminalStore.sol/SNOWSingleTokenPaymentTerminalStore.json';
import snowOperatoreStore from '../../../artifacts/contracts/SNOWOperatorStore.sol/SNOWOperatorStore.json';
import snowProjects from '../../../artifacts/contracts/SNOWProjects.sol/SNOWProjects.json';
import snowSplitsStore from '../../../artifacts/contracts/SNOWSplitsStore.sol/SNOWSplitsStore.json';
import snowToken from '../../../artifacts/contracts/SNOWToken.sol/SNOWToken.json';
import snowPrices from '../../../artifacts/contracts/SNOWPrices.sol/SNOWPrices.json';
import snowPayDelegate from '../../../artifacts/contracts/interfaces/ISNOWPayDelegate.sol/ISNOWPayDelegate.json';

describe('SNOWPayoutRedemptionPaymentTerminal::pay(...)', function () {
  const PROJECT_ID = 1;
  const MEMO = 'Memo Test';
  const ADJUSTED_MEMO = 'test test memo';
  const METADATA = '0x69';
  const FUNDING_CYCLE_NUMBER = 1;
  const ADJUSTED_WEIGHT = 10;
  const MIN_TOKEN_REQUESTED = 90;
  const TOKEN_TO_MINT = 200;
  const TOKEN_RECEIVED = 100;
  const ETH_TO_PAY = ethers.utils.parseEther('1');
  const PREFER_CLAIMED_TOKENS = true;
  const CURRENCY_AVAX = 1;
  const DECIMALS = 1;

  let ethToken;

  async function setup() {
    let [deployer, terminalOwner, caller, beneficiary, ...addrs] = await ethers.getSigners();

    const blockNum = await ethers.provider.getBlockNumber();
    const block = await ethers.provider.getBlock(blockNum);
    const timestamp = block.timestamp;
    const SPLITS_GROUP = 1;

    let [
      mockJbDirectory,
      mockSNOWPaymentTerminalStore,
      mockJbOperatorStore,
      mockJbProjects,
      mockJbSplitsStore,
      mockJbPayDelegate,
      mockJbPrices,
      mockJbController,
    ] = await Promise.all([
      deployMockContract(deployer, snowDirectory.abi),
      deployMockContract(deployer, snowPaymentTerminalStore.abi),
      deployMockContract(deployer, snowOperatoreStore.abi),
      deployMockContract(deployer, snowProjects.abi),
      deployMockContract(deployer, snowSplitsStore.abi),
      deployMockContract(deployer, snowPayDelegate.abi),
      deployMockContract(deployer, snowPrices.abi),
      deployMockContract(deployer, snowController.abi),
    ]);

    const mockJbToken = await deployMockContract(deployer, snowToken.abi);
    const NON_ETH_TOKEN = mockJbToken.address;

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

    ethToken = await snowEthPaymentTerminal.token();

    await mockJbToken.mock.decimals.returns(DECIMALS);

    let SNOWERC20PaymentTerminal = await snowErc20TerminalFactory
      .connect(deployer)
      .deploy(
        NON_ETH_TOKEN,
        CURRENCY_ETH,
        CURRENCY_ETH,
        SPLITS_GROUP,
        mockJbOperatorStore.address,
        mockJbProjects.address,
        mockJbDirectory.address,
        mockJbSplitsStore.address,
        mockJbPrices.address,
        mockSNOWPaymentTerminalStore.address,
        terminalOwner.address,
      );

    await mockJbDirectory.mock.isTerminalOf
      .withArgs(PROJECT_ID, snowEthPaymentTerminal.address)
      .returns(true);

    await mockJbDirectory.mock.isTerminalOf
      .withArgs(PROJECT_ID, SNOWERC20PaymentTerminal.address)
      .returns(true);

    await mockSNOWPaymentTerminalStore.mock.recordPaymentFrom
      .withArgs(
        caller.address,
        [
          /*token*/ '0x000000000000000000000000000000000000eeee',
          /*amount paid*/ ETH_TO_PAY,
          /*decimal*/ 18,
          CURRENCY_ETH,
        ],
        PROJECT_ID,
        CURRENCY_ETH,
        beneficiary.address,
        MEMO,
        METADATA,
      )
      .returns(
        {
          // mock SNOWFundingCycle obj
          number: 1,
          configuration: timestamp,
          basedOn: timestamp,
          start: timestamp,
          duration: 0,
          weight: 0,
          discountRate: 0,
          ballot: ethers.constants.AddressZero,
          metadata: packFundingCycleMetadata(),
        },
        TOKEN_TO_MINT,
        ethers.constants.AddressZero,
        ADJUSTED_MEMO,
      );

    return {
      terminalOwner,
      caller,
      beneficiary,
      addrs,
      snowEthPaymentTerminal,
      SNOWERC20PaymentTerminal,
      mockJbToken,
      mockJbDirectory,
      mockSNOWPaymentTerminalStore,
      mockJbPayDelegate,
      mockJbController,
      timestamp,
    };
  }

  it('Should record payment and emit event', async function () {
    const {
      caller,
      snowEthPaymentTerminal,
      mockJbDirectory,
      mockJbController,
      timestamp,
      beneficiary,
    } = await setup();

    await mockJbDirectory.mock.controllerOf.withArgs(PROJECT_ID).returns(mockJbController.address);

    await mockJbController.mock.mintTokensOf
      .withArgs(
        PROJECT_ID,
        TOKEN_TO_MINT,
        beneficiary.address,
        '',
        PREFER_CLAIMED_TOKENS,
        /* useReservedRate */ true,
      )
      .returns(TOKEN_RECEIVED);

    expect(
      await snowEthPaymentTerminal
        .connect(caller)
        .pay(
          PROJECT_ID,
          ETH_TO_PAY,
          ethers.constants.AddressZero,
          beneficiary.address,
          MIN_TOKEN_REQUESTED,
          PREFER_CLAIMED_TOKENS,
          MEMO,
          METADATA,
          { value: ETH_TO_PAY },
        ),
    )
      .to.emit(snowEthPaymentTerminal, 'Pay')
      .withArgs(
        /*fundingCycle.configuration=*/ timestamp,
        FUNDING_CYCLE_NUMBER,
        PROJECT_ID,
        caller.address,
        beneficiary.address,
        ETH_TO_PAY,
        TOKEN_RECEIVED,
        ADJUSTED_MEMO,
        METADATA,
        caller.address,
      );
  });

  it('Should record payment with delegate and emit delegate event', async function () {
    const {
      caller,
      snowEthPaymentTerminal,
      mockJbPayDelegate,
      mockSNOWPaymentTerminalStore,
      mockJbDirectory,
      mockJbController,
      timestamp,
      beneficiary,
    } = await setup();

    await mockJbDirectory.mock.controllerOf.withArgs(PROJECT_ID).returns(mockJbController.address);

    await mockJbController.mock.mintTokensOf
      .withArgs(
        PROJECT_ID,
        TOKEN_TO_MINT,
        /* beneficiary */ beneficiary.address,
        '',
        PREFER_CLAIMED_TOKENS,
        /* useReservedRate */ true,
      )
      .returns(TOKEN_RECEIVED);

    await mockSNOWPaymentTerminalStore.mock.recordPaymentFrom
      .withArgs(
        caller.address,
        [
          /*token*/ '0x000000000000000000000000000000000000eeee',
          /*amount paid*/ ETH_TO_PAY,
          /*decimal*/ 18,
          CURRENCY_ETH,
        ],
        PROJECT_ID,
        CURRENCY_ETH,
        beneficiary.address,
        MEMO,
        METADATA,
      )
      .returns(
        {
          // mock SNOWFundingCycle obj
          number: 1,
          configuration: timestamp,
          basedOn: timestamp,
          start: timestamp,
          duration: 0,
          weight: 0,
          discountRate: 0,
          ballot: ethers.constants.AddressZero,
          metadata: packFundingCycleMetadata(),
        },
        TOKEN_TO_MINT,
        mockJbPayDelegate.address,
        ADJUSTED_MEMO,
      );

    await mockJbPayDelegate.mock.didPay
      .withArgs({
        // SNOWDidPayData obj
        payer: caller.address,
        projectId: PROJECT_ID,
        currentFundingCycleConfiguration: timestamp,
        amount: {
          token: '0x000000000000000000000000000000000000eeee',
          value: ETH_TO_PAY,
          decimals: 18,
          currency: CURRENCY_ETH,
        },
        projectTokenCount: TOKEN_RECEIVED,
        beneficiary: beneficiary.address,
        preferClaimedTokens: PREFER_CLAIMED_TOKENS,
        memo: ADJUSTED_MEMO,
        metadata: METADATA,
      })
      .returns();

    const tx = await snowEthPaymentTerminal
      .connect(caller)
      .pay(
        PROJECT_ID,
        ETH_TO_PAY,
        ethers.constants.AddressZero,
        beneficiary.address,
        MIN_TOKEN_REQUESTED,
        PREFER_CLAIMED_TOKENS,
        MEMO,
        METADATA,
        { value: ETH_TO_PAY },
      );

    await expect(tx).to.emit(snowEthPaymentTerminal, 'DelegateDidPay');
    // AssertionError: expected [ Array(4) ] to equal [ Array(4) ]

    // .withArgs(
    //   mockJbPayDelegate.address,
    //   [
    //     // SNOWDidPayData obj
    //     caller.address,
    //     PROJECT_ID,
    //     [
    //       "0x000000000000000000000000000000000000EEEe",
    //       ETH_TO_PAY,
    //       ethers.BigNumber.from(18),
    //       ethers.BigNumber.from(CURRENCY_ETH)
    //     ],
    //     TOKEN_RECEIVED,
    //     beneficiary.address,
    //     ADJUSTED_MEMO,
    //     METADATA,
    //   ],
    //   caller.address,
    // );

    await expect(tx)
      .to.emit(snowEthPaymentTerminal, 'Pay')
      .withArgs(
        /*fundingCycle.configuration=*/ timestamp,
        FUNDING_CYCLE_NUMBER,
        PROJECT_ID,
        caller.address,
        beneficiary.address,
        ETH_TO_PAY,
        TOKEN_RECEIVED,
        ADJUSTED_MEMO,
        METADATA,
        caller.address,
      );
  });

  it('Should work with eth terminal with non msg.value amount sent', async function () {
    const { caller, snowEthPaymentTerminal, mockJbDirectory, mockJbController, beneficiary } =
      await setup();

    await mockJbDirectory.mock.controllerOf.withArgs(PROJECT_ID).returns(mockJbController.address);

    await mockJbController.mock.mintTokensOf
      .withArgs(
        PROJECT_ID,
        TOKEN_TO_MINT,
        /* beneficiary */ beneficiary.address,
        '',
        PREFER_CLAIMED_TOKENS,
        /* useReservedRate */ true,
      )
      .returns(TOKEN_RECEIVED);

    await snowEthPaymentTerminal
      .connect(caller)
      .pay(
        PROJECT_ID,
        ETH_TO_PAY + 1,
        ethers.constants.AddressZero,
        beneficiary.address,
        MIN_TOKEN_REQUESTED,
        /*preferClaimedToken=*/ true,
        MEMO,
        METADATA,
        { value: ETH_TO_PAY },
      );
  });
  it('Should work with no token amount returned from recording payment', async function () {
    const { caller, snowEthPaymentTerminal, mockSNOWPaymentTerminalStore, beneficiary, timestamp } =
      await setup();

    await mockSNOWPaymentTerminalStore.mock.recordPaymentFrom
      .withArgs(
        caller.address,
        [
          /*token*/ '0x000000000000000000000000000000000000eeee',
          /*amount paid*/ ETH_TO_PAY,
          /*decimal*/ 18,
          CURRENCY_ETH,
        ],
        PROJECT_ID,
        CURRENCY_ETH,
        beneficiary.address,
        MEMO,
        METADATA,
      )
      .returns(
        {
          // mock SNOWFundingCycle obj
          number: 1,
          configuration: timestamp,
          basedOn: timestamp,
          start: timestamp,
          duration: 0,
          weight: 0,
          discountRate: 0,
          ballot: ethers.constants.AddressZero,
          metadata: packFundingCycleMetadata(),
        },
        0,
        ethers.constants.AddressZero,
        ADJUSTED_MEMO,
      );

    await snowEthPaymentTerminal
      .connect(caller)
      .pay(
        PROJECT_ID,
        ETH_TO_PAY + 1,
        ethers.constants.AddressZero,
        beneficiary.address,
        0,
        PREFER_CLAIMED_TOKENS,
        MEMO,
        METADATA,
        { value: ETH_TO_PAY },
      );
  });

  it('Should work with non-eth terminal if no value is sent', async function () {
    const {
      caller,
      SNOWERC20PaymentTerminal,
      mockJbToken,
      mockJbDirectory,
      mockJbController,
      mockSNOWPaymentTerminalStore,
      beneficiary,
      timestamp,
    } = await setup();

    await mockJbDirectory.mock.controllerOf.withArgs(PROJECT_ID).returns(mockJbController.address);

    await mockJbController.mock.mintTokensOf
      .withArgs(
        PROJECT_ID,
        TOKEN_TO_MINT,
        beneficiary.address,
        '',
        PREFER_CLAIMED_TOKENS,
        /* useReservedRate */ true,
      )
      .returns(TOKEN_RECEIVED);

    await mockJbToken.mock.transferFrom
      .withArgs(caller.address, SNOWERC20PaymentTerminal.address, ETH_TO_PAY)
      .returns(0);

    let tokenAddress = await SNOWERC20PaymentTerminal.token();
    await mockSNOWPaymentTerminalStore.mock.recordPaymentFrom
      .withArgs(
        caller.address,
        [/*token*/ tokenAddress, /*amount paid*/ ETH_TO_PAY, /*decimal*/ DECIMALS, CURRENCY_ETH],
        PROJECT_ID,
        CURRENCY_ETH,
        beneficiary.address,
        MEMO,
        METADATA,
      )
      .returns(
        {
          // mock SNOWFundingCycle obj
          number: 1,
          configuration: timestamp,
          basedOn: timestamp,
          start: timestamp,
          duration: 0,
          weight: 0,
          discountRate: 0,
          ballot: ethers.constants.AddressZero,
          metadata: packFundingCycleMetadata(),
        },
        TOKEN_TO_MINT,
        ethers.constants.AddressZero,
        ADJUSTED_MEMO,
      );

    await SNOWERC20PaymentTerminal.connect(caller).pay(
      PROJECT_ID,
      ETH_TO_PAY,
      ethers.constants.AddressZero,
      beneficiary.address,
      MIN_TOKEN_REQUESTED,
      PREFER_CLAIMED_TOKENS,
      MEMO,
      METADATA,
      { value: 0 },
    );
  });

  it("Can't pay with value if terminal token isn't ETH", async function () {
    const { caller, SNOWERC20PaymentTerminal } = await setup();

    await expect(
      SNOWERC20PaymentTerminal.connect(caller).pay(
        PROJECT_ID,
        ETH_TO_PAY,
        ethers.constants.AddressZero,
        ethers.constants.AddressZero,
        MIN_TOKEN_REQUESTED,
        PREFER_CLAIMED_TOKENS,
        MEMO,
        METADATA,
        { value: ETH_TO_PAY },
      ),
    ).to.be.revertedWith(errors.NO_MSG_VALUE_ALLOWED);
  });

  it("Can't send tokens to the zero address", async function () {
    const { caller, snowEthPaymentTerminal } = await setup();

    await expect(
      snowEthPaymentTerminal
        .connect(caller)
        .pay(
          PROJECT_ID,
          ETH_TO_PAY,
          ethers.constants.AddressZero,
          ethers.constants.AddressZero,
          MIN_TOKEN_REQUESTED,
          PREFER_CLAIMED_TOKENS,
          MEMO,
          METADATA,
          { value: ETH_TO_PAY },
        ),
    ).to.be.revertedWith(errors.PAY_TO_ZERO_ADDRESS);
  });

  it("Can't pay if current terminal doesn't belong to project", async function () {
    const { caller, snowEthPaymentTerminal, mockJbDirectory } = await setup();

    const otherProjectId = 18;
    await mockJbDirectory.mock.isTerminalOf
      .withArgs(otherProjectId, snowEthPaymentTerminal.address)
      .returns(false);

    await expect(
      snowEthPaymentTerminal
        .connect(caller)
        .pay(
          otherProjectId,
          ETH_TO_PAY,
          ethers.constants.AddressZero,
          ethers.constants.AddressZero,
          MIN_TOKEN_REQUESTED,
          PREFER_CLAIMED_TOKENS,
          MEMO,
          METADATA,
          { value: ETH_TO_PAY },
        ),
    ).to.be.revertedWith(errors.PROJECT_TERMINAL_MISMATCH);
  });
  it("Can't pay if minted tokens for beneficiary is less than expected", async function () {
    const { caller, snowEthPaymentTerminal, mockSNOWPaymentTerminalStore, beneficiary, timestamp } =
      await setup();

    await mockSNOWPaymentTerminalStore.mock.recordPaymentFrom
      .withArgs(
        caller.address,
        [
          /*token*/ '0x000000000000000000000000000000000000eeee',
          /*amount paid*/ ETH_TO_PAY,
          /*decimal*/ 18,
          CURRENCY_ETH,
        ],
        PROJECT_ID,
        CURRENCY_ETH,
        beneficiary.address,
        MEMO,
        METADATA,
      )
      .returns(
        {
          // mock SNOWFundingCycle obj
          number: 1,
          configuration: timestamp,
          basedOn: timestamp,
          start: timestamp,
          duration: 0,
          weight: 0,
          discountRate: 0,
          ballot: ethers.constants.AddressZero,
          metadata: packFundingCycleMetadata(),
        },
        0,
        ethers.constants.AddressZero,
        ADJUSTED_MEMO,
      );

    await expect(
      snowEthPaymentTerminal
        .connect(caller)
        .pay(
          PROJECT_ID,
          ETH_TO_PAY + 1,
          ethers.constants.AddressZero,
          beneficiary.address,
          MIN_TOKEN_REQUESTED,
          PREFER_CLAIMED_TOKENS,
          MEMO,
          METADATA,
          { value: ETH_TO_PAY },
        ),
    ).to.be.revertedWith(errors.INADEQUATE_TOKEN_COUNT);
  });
});
