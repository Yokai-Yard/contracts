import { expect } from 'chai';
import { ethers } from 'hardhat';

import { deployMockContract } from '@ethereum-waffle/mock-contract';
import { packFundingCycleMetadata } from '../helpers/utils';

import snowFundingCycleStore from '../../artifacts/contracts/SNOWFundingCycleStore.sol/SNOWFundingCycleStore.json';
import snowOperatoreStore from '../../artifacts/contracts/SNOWOperatorStore.sol/SNOWOperatorStore.json';
import snowProjects from '../../artifacts/contracts/SNOWProjects.sol/SNOWProjects.json';
import snowTerminal from '../../artifacts/contracts/abstract/SNOWPayoutRedemptionPaymentTerminal.sol/SNOWPayoutRedemptionPaymentTerminal.json';

describe('SNOWDirectory::primaryTerminalOf(...)', function () {
  const PROJECT_ID = 13;

  async function setup() {
    let [deployer, projectOwner, ...addrs] = await ethers.getSigners();

    const blockNum = await ethers.provider.getBlockNumber();
    const block = await ethers.provider.getBlock(blockNum);
    const timestamp = block.timestamp;

    let mockJbFundingCycleStore = await deployMockContract(deployer, snowFundingCycleStore.abi);
    let mockJbOperatorStore = await deployMockContract(deployer, snowOperatoreStore.abi);
    let mockJbProjects = await deployMockContract(deployer, snowProjects.abi);

    let snowDirectoryFactory = await ethers.getContractFactory('SNOWDirectory');
    let snowDirectory = await snowDirectoryFactory.deploy(
      mockJbOperatorStore.address,
      mockJbProjects.address,
      mockJbFundingCycleStore.address,
      deployer.address,
    );

    let terminal1 = await deployMockContract(projectOwner, snowTerminal.abi);
    let terminal2 = await deployMockContract(projectOwner, snowTerminal.abi);

    await mockJbProjects.mock.ownerOf.withArgs(PROJECT_ID).returns(projectOwner.address);

    await mockJbFundingCycleStore.mock.currentOf.withArgs(PROJECT_ID).returns({
      number: 1,
      configuration: timestamp,
      basedOn: timestamp,
      start: timestamp,
      duration: 0,
      weight: 0,
      discountRate: 0,
      ballot: ethers.constants.AddressZero,
      metadata: packFundingCycleMetadata({ global: { allowSetTerminals: true } }),
    });

    // Add a few terminals
    await snowDirectory
      .connect(projectOwner)
      .setTerminalsOf(PROJECT_ID, [terminal1.address, terminal2.address]);

    return { projectOwner, deployer, addrs, snowDirectory, terminal1, terminal2 };
  }

  it('Should return primary terminal if set', async function () {
    const { projectOwner, snowDirectory, terminal1 } = await setup();

    let token = ethers.Wallet.createRandom().address;

    await terminal1.mock.token.returns(token);
    await terminal1.mock.acceptsToken.withArgs(token, PROJECT_ID).returns(true);

    await snowDirectory
      .connect(projectOwner)
      .setPrimaryTerminalOf(PROJECT_ID, token, terminal1.address);

    expect(await snowDirectory.connect(projectOwner).primaryTerminalOf(PROJECT_ID, token)).to.equal(
      terminal1.address,
    );
  });

  it('Should return terminal with matching token if set', async function () {
    const { projectOwner, snowDirectory, terminal1, terminal2 } = await setup();

    await terminal1.mock.token.returns(ethers.Wallet.createRandom().address);

    let token = ethers.Wallet.createRandom().address;
    await terminal2.mock.token.returns(token);

    await terminal1.mock.acceptsToken.withArgs(token, PROJECT_ID).returns(false);
    await terminal2.mock.acceptsToken.withArgs(token, PROJECT_ID).returns(true);

    expect(await snowDirectory.connect(projectOwner).primaryTerminalOf(PROJECT_ID, token)).to.equal(
      terminal2.address,
    );
  });
});
