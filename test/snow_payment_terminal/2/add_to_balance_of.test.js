import { expect } from 'chai';
import { ethers } from 'hardhat';
import { deployMockContract } from '@ethereum-waffle/mock-contract';
import { makeSplits, packFundingCycleMetadata, setBalance } from '../../helpers/utils.js';

import errors from '../../helpers/errors.json';

import snowDirectory from '../../../artifacts/contracts/SNOWDirectory.sol/SNOWDirectory.json';
import SNOWEthPaymentTerminal from '../../../artifacts/contracts/SNOWETHPaymentTerminal.sol/SNOWETHPaymentTerminal.json';
import snowPaymentTerminalStore from '../../../artifacts/contracts/SNOWSingleTokenPaymentTerminalStore.sol/SNOWSingleTokenPaymentTerminalStore.json';
import snowOperatoreStore from '../../../artifacts/contracts/SNOWOperatorStore.sol/SNOWOperatorStore.json';
import snowProjects from '../../../artifacts/contracts/SNOWProjects.sol/SNOWProjects.json';
import snowSplitsStore from '../../../artifacts/contracts/SNOWSplitsStore.sol/SNOWSplitsStore.json';
import snowToken from '../../../artifacts/contracts/SNOWToken.sol/SNOWToken.json';
import snowPrices from '../../../artifacts/contracts/SNOWPrices.sol/SNOWPrices.json';

describe('SNOWPayoutRedemptionPaymentTerminal::addToBalanceOf(...)', function () {
  const PROTOCOL_PROJECT_ID = 1;
  const PROJECT_ID = 2;
  const AMOUNT = ethers.utils.parseEther('10');
  const MIN_TOKEN_REQUESTED = 0;
  const MEMO = 'Memo Test';
  const METADATA = '0x69';
  const ETH_ADDRESS = '0x000000000000000000000000000000000000EEEe';

  let CURRENCY_ETH;
  let ETH_PAYOUT_INDEX;
  let MAX_FEE;
  let MAX_FEE_DISCOUNT;

  before(async function () {
    let snowSplitsGroupsFactory = await ethers.getContractFactory('SNOWSplitsGroups');
    let snowSplitsGroups = await snowSplitsGroupsFactory.deploy();

    ETH_PAYOUT_INDEX = await snowSplitsGroups.ETH_PAYOUT();

    const snowCurrenciesFactory = await ethers.getContractFactory('SNOWCurrencies');
    const snowCurrencies = await snowCurrenciesFactory.deploy();
    CURRENCY_AVAX = await snowCurrencies.AVAX();

    const snowConstantsFactory = await ethers.getContractFactory('SNOWConstants');
    const snowConstants = await snowConstantsFactory.deploy();
    MAX_FEE = await snowConstants.MAX_FEE();
    MAX_FEE_DISCOUNT = await snowConstants.MAX_FEE_DISCOUNT();
  });

  async function setup() {
    let [deployer, projectOwner, terminalOwner, caller, beneficiaryOne, beneficiaryTwo, ...addrs] =
      await ethers.getSigners();

    const blockNum = await ethers.provider.getBlockNumber();
    const block = await ethers.provider.getBlock(blockNum);
    const timestamp = block.timestamp;

    const SPLITS_GROUP = 1;

    let [
      mockJbDirectory,
      mockJbEthPaymentTerminal,
      mockSNOWPaymentTerminalStore,
      mockJbOperatorStore,
      mockJbProjects,
      mockJbSplitsStore,
      mockJbPrices,
      mockJbToken,
    ] = await Promise.all([
      deployMockContract(deployer, snowDirectory.abi),
      deployMockContract(deployer, SNOWEthPaymentTerminal.abi),
      deployMockContract(deployer, snowPaymentTerminalStore.abi),
      deployMockContract(deployer, snowOperatoreStore.abi),
      deployMockContract(deployer, snowProjects.abi),
      deployMockContract(deployer, snowSplitsStore.abi),
      deployMockContract(deployer, snowPrices.abi),
      deployMockContract(deployer, snowToken.abi),
    ]);

    let snowTerminalFactory = await ethers.getContractFactory(
      'contracts/SNOWETHPaymentTerminal.sol:SNOWETHPaymentTerminal',
      deployer,
    );
    let snowErc20TerminalFactory = await ethers.getContractFactory(
      'contracts/SNOWERC20PaymentTerminal.sol:SNOWERC20PaymentTerminal',
      deployer,
    );
    const NON_ETH_TOKEN = mockJbToken.address;

    let snowEthPaymentTerminal = await snowTerminalFactory
      .connect(deployer)
      .deploy(
        /*base weight currency*/ CURRENCY_ETH,
        mockJbOperatorStore.address,
        mockJbProjects.address,
        mockJbDirectory.address,
        mockJbSplitsStore.address,
        mockJbPrices.address,
        mockSNOWPaymentTerminalStore.address,
        terminalOwner.address,
      );

    const DECIMALS = 1;

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

    let fundingCycle = {
      number: 1,
      configuration: timestamp,
      basedOn: timestamp,
      start: timestamp,
      duration: 0,
      weight: 0,
      discountRate: 0,
      ballot: ethers.constants.AddressZero,
      metadata: packFundingCycleMetadata({ holdFees: 1 }),
    };

    await mockJbDirectory.mock.isTerminalOf
      .withArgs(PROJECT_ID, snowEthPaymentTerminal.address)
      .returns(true);

    await mockJbDirectory.mock.isTerminalOf
      .withArgs(PROJECT_ID, SNOWERC20PaymentTerminal.address)
      .returns(true);

    await mockJbDirectory.mock.primaryTerminalOf
      .withArgs(PROTOCOL_PROJECT_ID, ETH_ADDRESS)
      .returns(snowEthPaymentTerminal.address);

    await mockJbDirectory.mock.primaryTerminalOf
      .withArgs(PROTOCOL_PROJECT_ID, NON_ETH_TOKEN)
      .returns(SNOWERC20PaymentTerminal.address);

    await mockSNOWPaymentTerminalStore.mock.recordDistributionFor
      .withArgs(PROJECT_ID, AMOUNT, CURRENCY_ETH)
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
        AMOUNT,
      );

    await mockJbProjects.mock.ownerOf.withArgs(PROJECT_ID).returns(projectOwner.address);

    await mockSNOWPaymentTerminalStore.mock.recordAddedBalanceFor
      .withArgs(PROJECT_ID, AMOUNT)
      .returns();

    await ethers.provider.send('hardhat_setBalance', [
      snowEthPaymentTerminal.address,
      '0x100000000000000000000',
    ]);

    return {
      deployer,
      projectOwner,
      terminalOwner,
      caller,
      beneficiaryOne,
      beneficiaryTwo,
      addrs,
      snowEthPaymentTerminal,
      SNOWERC20PaymentTerminal,
      mockJbDirectory,
      mockJbEthPaymentTerminal,
      mockSNOWPaymentTerminalStore,
      mockJbToken,
      mockJbOperatorStore,
      mockJbSplitsStore,
      timestamp,
      fundingCycle,
    };
  }

  it('Should add to the project balance, refund any held fee and remove them if the transferred amount is enough, and emit event', async function () {
    const {
      caller,
      beneficiaryOne,
      beneficiaryTwo,
      snowEthPaymentTerminal,
      timestamp,
      mockJbSplitsStore,
      mockSNOWPaymentTerminalStore,
    } = await setup();
    const splits = makeSplits({
      count: 2,
      beneficiary: [beneficiaryOne.address, beneficiaryTwo.address],
    });

    await mockJbSplitsStore.mock.splitsOf
      .withArgs(PROJECT_ID, timestamp, ETH_PAYOUT_INDEX)
      .returns(splits);

    await snowEthPaymentTerminal
      .connect(caller)
      .distributePayoutsOf(
        PROJECT_ID,
        AMOUNT,
        ETH_PAYOUT_INDEX,
        ethers.constants.AddressZero,
        MIN_TOKEN_REQUESTED,
        MEMO,
      );

    let heldFee = await snowEthPaymentTerminal.heldFeesOf(PROJECT_ID);

    let discountedFee = ethers.BigNumber.from(heldFee[0].fee).sub(
      ethers.BigNumber.from(heldFee[0].fee)
        .mul(ethers.BigNumber.from(heldFee[0].feeDiscount))
        .div(MAX_FEE_DISCOUNT),
    );

    let feeNetAmount = ethers.BigNumber.from(heldFee[0].amount).sub(
      ethers.BigNumber.from(heldFee[0].amount).mul(MAX_FEE).div(discountedFee.add(MAX_FEE)),
    );
    await mockSNOWPaymentTerminalStore.mock.recordAddedBalanceFor
      .withArgs(PROJECT_ID, AMOUNT.add(feeNetAmount))
      .returns();

    expect(
      await snowEthPaymentTerminal
        .connect(caller)
        .addToBalanceOf(PROJECT_ID, AMOUNT, ETH_ADDRESS, MEMO, METADATA, { value: AMOUNT }),
    )
      .to.emit(snowEthPaymentTerminal, 'AddToBalance')
      .withArgs(PROJECT_ID, AMOUNT, feeNetAmount, MEMO, METADATA, caller.address)
      .and.to.emit(snowEthPaymentTerminal, 'RefundHeldFees')
      // add to balance: AMOUNT -> refund feeNetAmount (given AMOUNT > feeNetAmount) and left over is 0
      .withArgs(PROJECT_ID, AMOUNT, feeNetAmount, 0 /*leftOver*/, caller.address);

    expect(await snowEthPaymentTerminal.heldFeesOf(PROJECT_ID)).to.eql([]);
  });
  it('Should add to the project balance and not refund held fee if the sender is set as feeless, and emit event', async function () {
    const {
      caller,
      terminalOwner,
      beneficiaryOne,
      beneficiaryTwo,
      snowEthPaymentTerminal,
      timestamp,
      mockJbSplitsStore,
      mockSNOWPaymentTerminalStore,
    } = await setup();
    const splits = makeSplits({
      count: 2,
      beneficiary: [beneficiaryOne.address, beneficiaryTwo.address],
    });

    await mockJbSplitsStore.mock.splitsOf
      .withArgs(PROJECT_ID, timestamp, ETH_PAYOUT_INDEX)
      .returns(splits);

    await snowEthPaymentTerminal
      .connect(caller)
      .distributePayoutsOf(
        PROJECT_ID,
        AMOUNT,
        ETH_PAYOUT_INDEX,
        ethers.constants.AddressZero,
        MIN_TOKEN_REQUESTED,
        MEMO,
      );

    let heldFee = await snowEthPaymentTerminal.heldFeesOf(PROJECT_ID);

    await snowEthPaymentTerminal.connect(terminalOwner).setFeelessAddress(caller.address, true);

    let discountedFee = ethers.BigNumber.from(heldFee[0].fee).sub(
      ethers.BigNumber.from(heldFee[0].fee)
        .mul(ethers.BigNumber.from(heldFee[0].feeDiscount))
        .div(MAX_FEE_DISCOUNT),
    );

    let feeNetAmount = ethers.BigNumber.from(heldFee[0].amount).sub(
      ethers.BigNumber.from(heldFee[0].amount).mul(MAX_FEE).div(discountedFee.add(MAX_FEE)),
    );
    await mockSNOWPaymentTerminalStore.mock.recordAddedBalanceFor
      .withArgs(PROJECT_ID, AMOUNT.add(feeNetAmount))
      .returns();

    expect(
      await snowEthPaymentTerminal
        .connect(caller)
        .addToBalanceOf(PROJECT_ID, AMOUNT, ETH_ADDRESS, MEMO, METADATA, { value: AMOUNT }),
    )
      .to.emit(snowEthPaymentTerminal, 'AddToBalance')
      .withArgs(PROJECT_ID, AMOUNT, 0 /*refunded fee*/, MEMO, METADATA, caller.address)
      .and.to.not.emit(snowEthPaymentTerminal, 'RefundHeldFees');

    let heldFeeAfter = await snowEthPaymentTerminal.heldFeesOf(PROJECT_ID);

    expect(heldFeeAfter[0]).to.eql(heldFee[0]);
  });
  it('Should work with eth terminal with non msg.value amount sent', async function () {
    const { caller, snowEthPaymentTerminal, mockSNOWPaymentTerminalStore, fundingCycle } =
      await setup();
    await mockSNOWPaymentTerminalStore.mock.recordAddedBalanceFor
      .withArgs(PROJECT_ID, AMOUNT)
      .returns();

    await snowEthPaymentTerminal
      .connect(caller)
      .addToBalanceOf(PROJECT_ID, AMOUNT + 1, ETH_ADDRESS, MEMO, METADATA, { value: AMOUNT });
  });
  it('Should work with non-eth terminal if no value is sent', async function () {
    const {
      caller,
      SNOWERC20PaymentTerminal,
      mockJbToken,
      mockSNOWPaymentTerminalStore,
      fundingCycle,
    } = await setup();
    await mockSNOWPaymentTerminalStore.mock.recordAddedBalanceFor
      .withArgs(PROJECT_ID, AMOUNT)
      .returns();

    await mockJbToken.mock.transferFrom
      .withArgs(caller.address, SNOWERC20PaymentTerminal.address, AMOUNT)
      .returns(0);
    await SNOWERC20PaymentTerminal.connect(caller).addToBalanceOf(
      PROJECT_ID,
      AMOUNT,
      mockJbToken.address,
      MEMO,
      METADATA,
      {
        value: 0,
      },
    );
  });
  it('Should add to the project balance, partially refund a held fee and substract the amount from the held fee amount and emit event', async function () {
    const {
      caller,
      beneficiaryOne,
      beneficiaryTwo,
      snowEthPaymentTerminal,
      timestamp,
      mockJbSplitsStore,
      mockSNOWPaymentTerminalStore,
      fundingCycle,
    } = await setup();
    const splits = makeSplits({
      count: 2,
      beneficiary: [beneficiaryOne.address, beneficiaryTwo.address],
    });

    await mockJbSplitsStore.mock.splitsOf
      .withArgs(PROJECT_ID, timestamp, ETH_PAYOUT_INDEX)
      .returns(splits);

    await snowEthPaymentTerminal
      .connect(caller)
      .distributePayoutsOf(
        PROJECT_ID,
        AMOUNT,
        ETH_PAYOUT_INDEX,
        ethers.constants.AddressZero,
        MIN_TOKEN_REQUESTED,
        MEMO,
      );

    // Add 1 and refund 1
    await mockSNOWPaymentTerminalStore.mock.recordAddedBalanceFor
      .withArgs(PROJECT_ID, 1 + 1)
      .returns();

    let heldFeeBefore = await snowEthPaymentTerminal.heldFeesOf(PROJECT_ID);

    expect(
      await snowEthPaymentTerminal
        .connect(caller)
        .addToBalanceOf(PROJECT_ID, 1, ETH_ADDRESS, MEMO, METADATA, { value: 1 }),
    )
      .to.emit(snowEthPaymentTerminal, 'AddToBalance')
      .withArgs(PROJECT_ID, 1, 1, MEMO, METADATA, caller.address)
      .and.to.emit(snowEthPaymentTerminal, 'RefundHeldFees')
      // add to balance: 1 -> refund 1 and left over is 0
      .withArgs(PROJECT_ID, 1 /*amount*/, 1 /*refund*/, 0 /*leftOver*/, caller.address);

    let heldFeeAfter = await snowEthPaymentTerminal.heldFeesOf(PROJECT_ID);
    expect(heldFeeAfter[0].amount).to.equal(heldFeeBefore[0].amount.sub(1));
  });
  it('Should add to the project balance, refund multiple held fee by substracting the amount from the held fee amount when possible and emit event', async function () {
    const {
      caller,
      beneficiaryOne,
      beneficiaryTwo,
      snowEthPaymentTerminal,
      timestamp,
      mockJbSplitsStore,
      mockSNOWPaymentTerminalStore,
      fundingCycle,
    } = await setup();
    const splits = makeSplits({
      count: 2,
      beneficiary: [beneficiaryOne.address, beneficiaryTwo.address],
    });

    await mockJbSplitsStore.mock.splitsOf
      .withArgs(PROJECT_ID, timestamp, ETH_PAYOUT_INDEX)
      .returns(splits);

    await mockSNOWPaymentTerminalStore.mock.recordDistributionFor
      .withArgs(PROJECT_ID, AMOUNT.div(2), CURRENCY_ETH)
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
        AMOUNT.div(2),
      );

    await snowEthPaymentTerminal
      .connect(caller)
      .distributePayoutsOf(
        PROJECT_ID,
        AMOUNT.div(2),
        ETH_PAYOUT_INDEX,
        ethers.constants.AddressZero,
        MIN_TOKEN_REQUESTED,
        MEMO,
      );

    await snowEthPaymentTerminal
      .connect(caller)
      .distributePayoutsOf(
        PROJECT_ID,
        AMOUNT.div(2),
        ETH_PAYOUT_INDEX,
        ethers.constants.AddressZero,
        MIN_TOKEN_REQUESTED,
        MEMO,
      );

    let heldFee = await snowEthPaymentTerminal.heldFeesOf(PROJECT_ID);

    // Both held fees are identical:
    let discountedFee = ethers.BigNumber.from(heldFee[0].fee).sub(
      ethers.BigNumber.from(heldFee[0].fee)
        .mul(ethers.BigNumber.from(heldFee[0].feeDiscount))
        .div(MAX_FEE_DISCOUNT),
    );

    let feeNetAmount = ethers.BigNumber.from(heldFee[0].amount).sub(
      ethers.BigNumber.from(heldFee[0].amount).mul(MAX_FEE).div(discountedFee.add(MAX_FEE)),
    );

    await mockSNOWPaymentTerminalStore.mock.recordAddedBalanceFor
      .withArgs(PROJECT_ID, AMOUNT.sub('10').add(feeNetAmount.mul(2)))
      .returns();

    expect(
      await snowEthPaymentTerminal
        .connect(caller)
        .addToBalanceOf(PROJECT_ID, AMOUNT.sub('10'), ETH_ADDRESS, MEMO, METADATA, {
          value: AMOUNT.sub('10'),
        }),
    )
      .to.emit(snowEthPaymentTerminal, 'AddToBalance')
      .withArgs(
        PROJECT_ID,
        AMOUNT.sub('10'),
        feeNetAmount.add(feeNetAmount),
        MEMO,
        METADATA,
        caller.address,
      )
      .and.to.emit(snowEthPaymentTerminal, 'RefundHeldFees')
      // add to balance: AMOUNT.sub('10') -> refund feeNetAmount.mul(2) and left over is 0
      .withArgs(
        PROJECT_ID,
        AMOUNT.sub('10') /*amount*/,
        feeNetAmount.mul(2) /*refund*/,
        0 /*leftOver*/,
        caller.address,
      );

    let heldFeeAfter = await snowEthPaymentTerminal.heldFeesOf(PROJECT_ID);
    // Only 10 left
    expect(heldFeeAfter[0].amount).to.equal(10);
  });
  it('Should add to the project balance, refund one out of multiple held fees bigger than the amount, keep the held fee difference and emit event', async function () {
    const {
      caller,
      beneficiaryOne,
      beneficiaryTwo,
      snowEthPaymentTerminal,
      timestamp,
      mockJbSplitsStore,
      mockSNOWPaymentTerminalStore,
      fundingCycle,
    } = await setup();
    const splits = makeSplits({
      count: 2,
      beneficiary: [beneficiaryOne.address, beneficiaryTwo.address],
    });

    await mockJbSplitsStore.mock.splitsOf
      .withArgs(PROJECT_ID, timestamp, ETH_PAYOUT_INDEX)
      .returns(splits);

    await mockSNOWPaymentTerminalStore.mock.recordDistributionFor
      .withArgs(PROJECT_ID, AMOUNT.div(2), CURRENCY_ETH)
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
        AMOUNT,
      );

    await snowEthPaymentTerminal
      .connect(caller)
      .distributePayoutsOf(
        PROJECT_ID,
        AMOUNT,
        ETH_PAYOUT_INDEX,
        ethers.constants.AddressZero,
        MIN_TOKEN_REQUESTED,
        MEMO,
      );

    await snowEthPaymentTerminal
      .connect(caller)
      .distributePayoutsOf(
        PROJECT_ID,
        AMOUNT,
        ETH_PAYOUT_INDEX,
        ethers.constants.AddressZero,
        MIN_TOKEN_REQUESTED,
        MEMO,
      );

    let heldFee = await snowEthPaymentTerminal.heldFeesOf(PROJECT_ID);

    // Both held fees are identical:
    let discountedFee = ethers.BigNumber.from(heldFee[0].fee).sub(
      ethers.BigNumber.from(heldFee[0].fee)
        .mul(ethers.BigNumber.from(heldFee[0].feeDiscount))
        .div(MAX_FEE_DISCOUNT),
    );

    // Adding amount/4 to balance while there are 2 fee held on 'amount'
    const amountToAdd = AMOUNT.div(2);

    // fee from one distribute
    let feeFromOneAmount = ethers.BigNumber.from(heldFee[0].amount).sub(
      ethers.BigNumber.from(heldFee[0].amount).mul(MAX_FEE).div(discountedFee.add(MAX_FEE)),
    );

    // fee which can be used based on amountToAdd
    let feeNetAmount = feeFromOneAmount.div(2);

    await mockSNOWPaymentTerminalStore.mock.recordAddedBalanceFor
      .withArgs(PROJECT_ID, amountToAdd.add(feeNetAmount))
      .returns();

    expect(
      await snowEthPaymentTerminal
        .connect(caller)
        .addToBalanceOf(PROJECT_ID, amountToAdd, ETH_ADDRESS, MEMO, METADATA, {
          value: amountToAdd,
        }),
    )
      .to.emit(snowEthPaymentTerminal, 'AddToBalance')
      .withArgs(PROJECT_ID, amountToAdd, feeNetAmount, MEMO, METADATA, caller.address)
      .and.to.emit(snowEthPaymentTerminal, 'RefundHeldFees')
      // add to balance: amountToAdd -> refund feeNetAmount * 0.75 and left over is 0
      .withArgs(
        PROJECT_ID,
        amountToAdd /*amount*/,
        feeNetAmount /*refund*/,
        0 /*leftOver*/,
        caller.address,
      );

    let heldFeeAfter = await snowEthPaymentTerminal.heldFeesOf(PROJECT_ID);

    // Only 25% of the initial held fee left
    expect(heldFeeAfter[0].amount).to.equal(AMOUNT.div(2));
  });
  it('Should add to the project balance, refund all the held fees if the amount to add to balance if bigger and emit event', async function () {
    const {
      caller,
      beneficiaryOne,
      beneficiaryTwo,
      snowEthPaymentTerminal,
      timestamp,
      mockJbSplitsStore,
      mockSNOWPaymentTerminalStore,
      fundingCycle,
    } = await setup();
    const splits = makeSplits({
      count: 2,
      beneficiary: [beneficiaryOne.address, beneficiaryTwo.address],
    });

    await mockJbSplitsStore.mock.splitsOf
      .withArgs(PROJECT_ID, timestamp, ETH_PAYOUT_INDEX)
      .returns(splits);

    await snowEthPaymentTerminal
      .connect(caller)
      .distributePayoutsOf(
        PROJECT_ID,
        AMOUNT,
        ETH_PAYOUT_INDEX,
        ethers.constants.AddressZero,
        MIN_TOKEN_REQUESTED,
        MEMO,
      );

    // Only one held fee
    let heldFeeBefore = await snowEthPaymentTerminal.heldFeesOf(PROJECT_ID);

    let discountedFee = ethers.BigNumber.from(heldFeeBefore[0].fee).sub(
      ethers.BigNumber.from(heldFeeBefore[0].fee)
        .mul(ethers.BigNumber.from(heldFeeBefore[0].feeDiscount))
        .div(MAX_FEE_DISCOUNT),
    );

    let netHeldFee = ethers.BigNumber.from(heldFeeBefore[0].amount).sub(
      ethers.BigNumber.from(heldFeeBefore[0].amount).mul(MAX_FEE).div(discountedFee.add(MAX_FEE)),
    );

    // both total amount and refund fee are added
    await mockSNOWPaymentTerminalStore.mock.recordAddedBalanceFor
      .withArgs(PROJECT_ID, AMOUNT.mul(2).add(netHeldFee))
      .returns();

    expect(
      await snowEthPaymentTerminal
        .connect(caller)
        .addToBalanceOf(PROJECT_ID, AMOUNT.mul(2), ETH_ADDRESS, MEMO, METADATA, {
          value: AMOUNT.mul(2),
        }),
    )
      .to.emit(snowEthPaymentTerminal, 'AddToBalance')
      .withArgs(PROJECT_ID, AMOUNT.mul(2), netHeldFee, MEMO, METADATA, caller.address)
      .and.to.emit(snowEthPaymentTerminal, 'RefundHeldFees')
      // add to balance: AMOUNT*2 -> refund the whole net fee and the left over is the amount for which a fee wasn't refunded
      .withArgs(
        PROJECT_ID,
        AMOUNT.mul(2) /*amount*/,
        netHeldFee /*refund*/,
        AMOUNT /*leftOver*/,
        caller.address,
      );

    let heldFeeAfter = await snowEthPaymentTerminal.heldFeesOf(PROJECT_ID);
    expect(heldFeeAfter).to.eql([]);
  });
  it("Can't add with value if terminal token isn't ETH", async function () {
    const { caller, SNOWERC20PaymentTerminal, mockJbToken } = await setup();

    await expect(
      SNOWERC20PaymentTerminal.connect(caller).addToBalanceOf(
        PROJECT_ID,
        AMOUNT,
        mockJbToken.address,
        MEMO,
        METADATA,
        {
          value: 10,
        },
      ),
    ).to.be.revertedWith(errors.NO_MSG_VALUE_ALLOWED);
  });
  it("Can't add to balance if terminal doesn't belong to project", async function () {
    const { caller, snowEthPaymentTerminal, mockJbDirectory } = await setup();

    const otherProjectId = 18;
    await mockJbDirectory.mock.isTerminalOf
      .withArgs(otherProjectId, snowEthPaymentTerminal.address)
      .returns(false);

    await expect(
      snowEthPaymentTerminal
        .connect(caller)
        .addToBalanceOf(otherProjectId, AMOUNT, ETH_ADDRESS, MEMO, METADATA, { value: 0 }),
    ).to.be.revertedWith(errors.PROJECT_TERMINAL_MISMATCH);
  });
});
