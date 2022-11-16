import { expect } from 'chai';
import { ethers } from 'hardhat';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import errors from '../helpers/errors.json';
import { packFundingCycleMetadata, impersonateAccount } from '../helpers/utils';

import snowController from '../../artifacts/contracts/interfaces/ISNOWController.sol/ISNOWController.json';
import snowDirectory from '../../artifacts/contracts/interfaces/ISNOWDirectory.sol/ISNOWDirectory.json';
import jBFundingCycleStore from '../../artifacts/contracts/interfaces/ISNOWFundingCycleStore.sol/ISNOWFundingCycleStore.json';
import snowFundingCycleDataSource from '../../artifacts/contracts/interfaces/ISNOWFundingCycleDataSource.sol/ISNOWFundingCycleDataSource.json';
import snowPrices from '../../artifacts/contracts/interfaces/ISNOWPrices.sol/ISNOWPrices.json';
import snowProjects from '../../artifacts/contracts/interfaces/ISNOWProjects.sol/ISNOWProjects.json';
import snowTerminal from '../../artifacts/contracts/abstract/SNOWPayoutRedemptionPaymentTerminal.sol/SNOWPayoutRedemptionPaymentTerminal.json';
import snowTokenStore from '../../artifacts/contracts/interfaces/ISNOWTokenStore.sol/ISNOWTokenStore.json';

describe('SNOWSingleTokenPaymentTerminalStore::recordPaymentFrom(...)', function () {
  const PROJECT_ID = 2;

  const AMOUNT = ethers.utils.parseEther('4351');
  const WEIGHT = ethers.utils.parseEther('900');

  const CURRENCY = 1;
  const BASE_CURRENCY = 1;
  const METADATA = ethers.utils.randomBytes(32);
  const _FIXED_POINT_MAX_FIDELITY = 18;

  async function setup() {
    const [deployer, payer, beneficiary, ...addrs] = await ethers.getSigners();

    const mockJbPrices = await deployMockContract(deployer, snowPrices.abi);
    const mockJbProjects = await deployMockContract(deployer, snowProjects.abi);
    const mockJbFundingCycleStore = await deployMockContract(deployer, jBFundingCycleStore.abi);
    const mockJbFundingCycleDataSource = await deployMockContract(
      deployer,
      snowFundingCycleDataSource.abi,
    );
    const mockJbTerminal = await deployMockContract(deployer, snowTerminal.abi);
    const mockJbTokenStore = await deployMockContract(deployer, snowTokenStore.abi);
    const mockJbController = await deployMockContract(deployer, snowController.abi);
    const mockJbDirectory = await deployMockContract(deployer, snowDirectory.abi);

    const SNOWPaymentTerminalStoreFactory = await ethers.getContractFactory(
      'contracts/SNOWSingleTokenPaymentTerminalStore.sol:SNOWSingleTokenPaymentTerminalStore',
    );
    const SNOWSingleTokenPaymentTerminalStore = await SNOWPaymentTerminalStoreFactory.deploy(
      mockJbDirectory.address,
      mockJbFundingCycleStore.address,
      mockJbPrices.address,
    );

    const blockNum = await ethers.provider.getBlockNumber();
    const block = await ethers.provider.getBlock(blockNum);
    const timestamp = block.timestamp;

    /* Common mocks */

    // await mockJbTerminal.mock.currency.returns(CURRENCY);
    // await mockJbTerminal.mock.baseWeightCurrency.returns(BASE_CURRENCY);

    const mockJbTerminalSigner = await impersonateAccount(mockJbTerminal.address);

    return {
      mockJbTerminal,
      mockJbTerminalSigner,
      payer,
      beneficiary,
      mockJbController,
      mockJbPrices,
      mockJbFundingCycleStore,
      mockJbFundingCycleDataSource,
      mockJbPrices,
      SNOWSingleTokenPaymentTerminalStore,
      timestamp,
      addrs,
    };
  }

  /* Happy path tests with mockJbTerminal access */

  it('Should record payment without a datasource', async function () {
    const {
      mockJbTerminalSigner,
      payer,
      beneficiary,
      mockJbFundingCycleStore,
      SNOWSingleTokenPaymentTerminalStore,
      timestamp,
    } = await setup();

    const reservedRate = 0;

    await mockJbFundingCycleStore.mock.currentOf.withArgs(PROJECT_ID).returns({
      // mock SNOWFundingCycle obj
      number: 1,
      configuration: timestamp,
      basedOn: timestamp,
      start: timestamp,
      duration: 0,
      weight: WEIGHT,
      discountRate: 0,
      ballot: ethers.constants.AddressZero,
      metadata: packFundingCycleMetadata({ pausePay: 0, reservedRate: reservedRate }),
    });

    expect(
      await SNOWSingleTokenPaymentTerminalStore.balanceOf(mockJbTerminalSigner.address, PROJECT_ID),
    ).to.equal(0);

    // Record the payment
    await SNOWSingleTokenPaymentTerminalStore.connect(mockJbTerminalSigner).recordPaymentFrom(
      payer.address,
      ['0x1230000000000000000000000000000000000000', AMOUNT, 18, CURRENCY],
      PROJECT_ID,
      BASE_CURRENCY,
      beneficiary.address,
      /* memo */ 'test',
      METADATA,
    );

    // Expect recorded balance to change
    expect(
      await SNOWSingleTokenPaymentTerminalStore.balanceOf(mockJbTerminalSigner.address, PROJECT_ID),
    ).to.equal(AMOUNT);
  });

  it('Should record payment with no weight', async function () {
    const {
      mockJbTerminalSigner,
      payer,
      beneficiary,
      mockJbFundingCycleStore,
      SNOWSingleTokenPaymentTerminalStore,
      timestamp,
    } = await setup();

    const reservedRate = 0;

    await mockJbFundingCycleStore.mock.currentOf.withArgs(PROJECT_ID).returns({
      // mock SNOWFundingCycle obj
      number: 1,
      configuration: timestamp,
      basedOn: timestamp,
      start: timestamp,
      duration: 0,
      weight: 0,
      discountRate: 0,
      ballot: ethers.constants.AddressZero,
      metadata: packFundingCycleMetadata({ pausePay: 0, reservedRate: reservedRate }),
    });

    expect(
      await SNOWSingleTokenPaymentTerminalStore.balanceOf(mockJbTerminalSigner.address, PROJECT_ID),
    ).to.equal(0);

    // Record the payment
    await SNOWSingleTokenPaymentTerminalStore.connect(mockJbTerminalSigner).recordPaymentFrom(
      /* payer */ payer.address,
      ['0x1230000000000000000000000000000000000000', AMOUNT, 18, CURRENCY],
      PROJECT_ID,
      BASE_CURRENCY,
      beneficiary.address,
      /* memo */ 'test',
      METADATA,
    );

    // Expect recorded balance to change
    expect(
      await SNOWSingleTokenPaymentTerminalStore.balanceOf(mockJbTerminalSigner.address, PROJECT_ID),
    ).to.equal(AMOUNT);
  });

  it('Should record payment with a datasource and emit event', async function () {
    const {
      mockJbTerminalSigner,
      payer,
      beneficiary,
      mockJbFundingCycleStore,
      mockJbFundingCycleDataSource,
      SNOWSingleTokenPaymentTerminalStore,
      timestamp,
      addrs,
    } = await setup();

    const memo = 'test';
    const reservedRate = 0;
    const packedMetadata = packFundingCycleMetadata({
      pausePay: 0,
      reservedRate: reservedRate,
      useDataSourceForPay: 1,
      dataSource: mockJbFundingCycleDataSource.address,
    });

    await mockJbFundingCycleStore.mock.currentOf.withArgs(PROJECT_ID).returns({
      // SNOWFundingCycle obj
      number: 1,
      configuration: timestamp,
      basedOn: timestamp,
      start: timestamp,
      duration: 0,
      weight: WEIGHT,
      discountRate: 0,
      ballot: ethers.constants.AddressZero,
      metadata: packedMetadata,
    });

    const newMemo = 'new memo';
    const delegate = addrs[0];

    await mockJbFundingCycleDataSource.mock.payParams
      .withArgs({
        // SNOWPayParamsData obj
        terminal: mockJbTerminalSigner.address,
        payer: payer.address,
        amount: ['0x1230000000000000000000000000000000000000', AMOUNT, 18, CURRENCY],
        decimal: _FIXED_POINT_MAX_FIDELITY,
        projectId: PROJECT_ID,
        currentFundingCycleConfiguration: timestamp,
        beneficiary,
        weight: WEIGHT,
        reservedRate: reservedRate,
        beneficiary: beneficiary.address,
        memo: memo,
        metadata: METADATA,
      })
      .returns(WEIGHT, newMemo, delegate.address);

    expect(
      await SNOWSingleTokenPaymentTerminalStore.balanceOf(mockJbTerminalSigner.address, PROJECT_ID),
    ).to.equal(0);

    // Record the payment
    await SNOWSingleTokenPaymentTerminalStore.connect(mockJbTerminalSigner).recordPaymentFrom(
      /* payer */ payer.address,
      /* amount */
      ['0x1230000000000000000000000000000000000000', AMOUNT, 18, CURRENCY],
      /* projectId */ PROJECT_ID,
      BASE_CURRENCY,
      beneficiary.address,
      /* memo */ 'test',
      METADATA,
    );

    // Expect recorded balance to change
    expect(
      await SNOWSingleTokenPaymentTerminalStore.balanceOf(mockJbTerminalSigner.address, PROJECT_ID),
    ).to.equal(AMOUNT);
  });

  it('Should record payment without a weight', async function () {
    const {
      mockJbTerminalSigner,
      payer,
      beneficiary,
      mockJbFundingCycleStore,
      SNOWSingleTokenPaymentTerminalStore,
      timestamp,
    } = await setup();

    const reservedRate = 0;

    await mockJbFundingCycleStore.mock.currentOf.withArgs(PROJECT_ID).returns({
      // mock SNOWFundingCycle obj
      number: 1,
      configuration: timestamp,
      basedOn: timestamp,
      start: timestamp,
      duration: 0,
      weight: 0,
      discountRate: 0,
      ballot: ethers.constants.AddressZero,
      metadata: packFundingCycleMetadata({ pausePay: 0, reservedRate: reservedRate }),
    });

    expect(
      await SNOWSingleTokenPaymentTerminalStore.balanceOf(mockJbTerminalSigner.address, PROJECT_ID),
    ).to.equal(0);

    // Record the payment
    await SNOWSingleTokenPaymentTerminalStore.connect(mockJbTerminalSigner).recordPaymentFrom(
      /* payer */ payer.address,
      ['0x1230000000000000000000000000000000000000', AMOUNT, 18, CURRENCY],
      PROJECT_ID,
      BASE_CURRENCY,
      beneficiary.address,
      /* memo */ 'test',
      METADATA,
    );

    // Expect recorded balance to change
    expect(
      await SNOWSingleTokenPaymentTerminalStore.balanceOf(mockJbTerminalSigner.address, PROJECT_ID),
    ).to.equal(AMOUNT);
  });

  it('Should record payment with a base weight currency that differs from the terminal currency', async function () {
    const {
      mockJbTerminalSigner,
      payer,
      beneficiary,
      mockJbFundingCycleStore,
      SNOWSingleTokenPaymentTerminalStore,
      mockJbTerminal,
      mockJbPrices,
      timestamp,
    } = await setup();

    const reservedRate = 0;
    const otherBaseCurrency = 2;
    const conversionPrice = ethers.BigNumber.from(2);
    await mockJbTerminal.mock.baseWeightCurrency.returns(otherBaseCurrency);

    await mockJbPrices.mock.priceFor
      .withArgs(CURRENCY, otherBaseCurrency, _FIXED_POINT_MAX_FIDELITY)
      .returns(conversionPrice.mul(ethers.BigNumber.from(10).pow(18)));

    await mockJbFundingCycleStore.mock.currentOf.withArgs(PROJECT_ID).returns({
      // mock SNOWFundingCycle obj
      number: 1,
      configuration: timestamp,
      basedOn: timestamp,
      start: timestamp,
      duration: 0,
      weight: WEIGHT,
      discountRate: 0,
      ballot: ethers.constants.AddressZero,
      metadata: packFundingCycleMetadata({ pausePay: 0, reservedRate: reservedRate }),
    });

    expect(
      await SNOWSingleTokenPaymentTerminalStore.balanceOf(mockJbTerminalSigner.address, PROJECT_ID),
    ).to.equal(0);

    // Record the payment
    await SNOWSingleTokenPaymentTerminalStore.connect(mockJbTerminalSigner).recordPaymentFrom(
      /* payer */ payer.address,
      ['0x1230000000000000000000000000000000000000', AMOUNT, 18, CURRENCY],
      PROJECT_ID,
      otherBaseCurrency,
      beneficiary.address,
      /* memo */ 'test',
      METADATA,
    );

    // Expect recorded balance to change
    expect(
      await SNOWSingleTokenPaymentTerminalStore.balanceOf(mockJbTerminalSigner.address, PROJECT_ID),
    ).to.equal(AMOUNT);
  });

  it(`Should skip minting and recording payment if amount is 0`, async function () {
    const {
      mockJbTerminalSigner,
      payer,
      beneficiary,
      mockJbFundingCycleStore,
      mockJbFundingCycleDataSource,
      SNOWSingleTokenPaymentTerminalStore,
      timestamp,
      addrs,
    } = await setup();

    const memo = 'test';
    const reservedRate = 0;
    const packedMetadata = packFundingCycleMetadata({
      pausePay: 0,
      reservedRate: reservedRate,
      useDataSourceForPay: 1,
      dataSource: mockJbFundingCycleDataSource.address,
    });

    await mockJbFundingCycleStore.mock.currentOf.withArgs(PROJECT_ID).returns({
      // SNOWFundingCycle obj
      number: 1,
      configuration: timestamp,
      basedOn: timestamp,
      start: timestamp,
      duration: 0,
      weight: WEIGHT,
      discountRate: 0,
      ballot: ethers.constants.AddressZero,
      metadata: packedMetadata,
    });

    const newMemo = 'new memo';
    const delegate = addrs[0];
    await mockJbFundingCycleDataSource.mock.payParams
      .withArgs({
        // SNOWPayParamsData obj
        terminal: mockJbTerminalSigner.address,
        payer: payer.address,
        amount: ['0x1230000000000000000000000000000000000000', 0, 18, CURRENCY],
        projectId: PROJECT_ID,
        currentFundingCycleConfiguration: timestamp,
        beneficiary: beneficiary.address,
        weight: WEIGHT,
        reservedRate: reservedRate,
        memo: memo,
        metadata: METADATA,
      })
      .returns(WEIGHT, newMemo, delegate.address);

    expect(
      await SNOWSingleTokenPaymentTerminalStore.balanceOf(mockJbTerminalSigner.address, PROJECT_ID),
    ).to.equal(0);

    // Record the payment
    const tx = await SNOWSingleTokenPaymentTerminalStore.connect(
      mockJbTerminalSigner,
    ).callStatic.recordPaymentFrom(
      /* payer */ payer.address,
      ['0x1230000000000000000000000000000000000000', 0, 18, CURRENCY],
      /* projectId */ PROJECT_ID,
      BASE_CURRENCY,
      beneficiary.address,
      /* memo */ memo,
      METADATA,
    );

    await SNOWSingleTokenPaymentTerminalStore.connect(mockJbTerminalSigner).recordPaymentFrom(
      /* payer */ payer.address,
      ['0x1230000000000000000000000000000000000000', 0, 18, CURRENCY],
      /* projectId */ PROJECT_ID,
      BASE_CURRENCY,
      beneficiary.address,
      /* memo */ memo,
      METADATA,
    );

    // Recorded balance should not have changed
    expect(
      await SNOWSingleTokenPaymentTerminalStore.balanceOf(mockJbTerminalSigner.address, PROJECT_ID),
    ).to.equal(0);

    expect(tx.delegate).to.equal(delegate.address);
  });

  /* Sad path tests */

  it(`Can't record payment if fundingCycle hasn't been configured`, async function () {
    const {
      mockJbTerminalSigner,
      payer,
      beneficiary,
      mockJbFundingCycleStore,
      SNOWSingleTokenPaymentTerminalStore,
    } = await setup();

    await mockJbFundingCycleStore.mock.currentOf.withArgs(PROJECT_ID).returns({
      // empty SNOWFundingCycle obj
      number: 0, // Set bad number
      configuration: 0,
      basedOn: 0,
      start: 0,
      duration: 0,
      weight: 0,
      discountRate: 0,
      ballot: ethers.constants.AddressZero,
      metadata: 0,
    });

    // Record the payment
    await expect(
      SNOWSingleTokenPaymentTerminalStore.connect(mockJbTerminalSigner).recordPaymentFrom(
        /* payer */ payer.address,
        ['0x1230000000000000000000000000000000000000', AMOUNT, 18, CURRENCY],
        PROJECT_ID,
        BASE_CURRENCY,
        beneficiary.address,
        /* memo */ 'test',
        METADATA,
      ),
    ).to.be.revertedWith(errors.INVALID_FUNDING_CYCLE);
  });

  it(`Can't record payment if fundingCycle has been paused`, async function () {
    const {
      mockJbTerminalSigner,
      payer,
      beneficiary,
      mockJbFundingCycleStore,
      SNOWSingleTokenPaymentTerminalStore,
    } = await setup();

    await mockJbFundingCycleStore.mock.currentOf.withArgs(PROJECT_ID).returns({
      // mock SNOWFundingCycle obj
      number: 1,
      configuration: 0,
      basedOn: 0,
      start: 0,
      duration: 0,
      weight: 0,
      discountRate: 0,
      ballot: ethers.constants.AddressZero,
      metadata: packFundingCycleMetadata({ pausePay: 1 }), // Payments paused
    });

    // Record the payment
    await expect(
      SNOWSingleTokenPaymentTerminalStore.connect(mockJbTerminalSigner).recordPaymentFrom(
        /* payer */ payer.address,
        ['0x1230000000000000000000000000000000000000', AMOUNT, 18, CURRENCY],
        PROJECT_ID,
        BASE_CURRENCY,
        beneficiary.address,
        /* memo */ 'test',
        METADATA,
      ),
    ).to.be.revertedWith(errors.FUNDING_CYCLE_PAYMENT_PAUSED);
  });
});
