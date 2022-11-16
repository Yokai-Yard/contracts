import { expect } from 'chai';
import { ethers } from 'hardhat';
import errors from '../helpers/errors.json';
import { deployMockContract } from '@ethereum-waffle/mock-contract';

import snowFundingCycleStore from '../../artifacts/contracts/SNOWFundingCycleStore.sol/SNOWFundingCycleStore.json';
import snowController from '../../artifacts/contracts/interfaces/ISNOWController.sol/ISNOWController.json';
import snowOperatoreStore from '../../artifacts/contracts/SNOWOperatorStore.sol/SNOWOperatorStore.json';
import snowProjects from '../../artifacts/contracts/SNOWProjects.sol/SNOWProjects.json';

describe('SNOWDirectory::setIsAllowedToSetFirstController(...)', function () {
  async function setup() {
    let [deployer, ...addrs] = await ethers.getSigners();

    let mockJbFundingCycleStore = await deployMockContract(deployer, snowFundingCycleStore.abi);
    let mockJbOperatorStore = await deployMockContract(deployer, snowOperatoreStore.abi);
    let mockJbProjects = await deployMockContract(deployer, snowProjects.abi);
    let mockJbController = await deployMockContract(deployer, snowController.abi);

    let snowDirectoryFactory = await ethers.getContractFactory('SNOWDirectory');
    let snowDirectory = await snowDirectoryFactory.deploy(
      mockJbOperatorStore.address,
      mockJbProjects.address,
      mockJbFundingCycleStore.address,
      deployer.address,
    );

    return {
      deployer,
      addrs,
      snowDirectory,
      mockJbController,
    };
  }

  it('Should add a controller to the list and emit events if caller is SNOWDirectory owner', async function () {
    const { deployer, snowDirectory, mockJbController } = await setup();

    await expect(
      snowDirectory
        .connect(deployer)
        .setIsAllowedToSetFirstController(mockJbController.address, true),
    )
      .to.emit(snowDirectory, 'SetIsAllowedToSetFirstController')
      .withArgs(mockJbController.address, true, deployer.address);

    expect(await snowDirectory.isAllowedToSetFirstController(mockJbController.address)).to.be.true;
  });

  it('Should remove a controller and emit events if caller is SNOWDirectory owner', async function () {
    const { deployer, snowDirectory, mockJbController } = await setup();

    await expect(
      snowDirectory
        .connect(deployer)
        .setIsAllowedToSetFirstController(mockJbController.address, false),
    )
      .to.emit(snowDirectory, 'SetIsAllowedToSetFirstController')
      .withArgs(mockJbController.address, false, deployer.address);

    expect(await snowDirectory.isAllowedToSetFirstController(mockJbController.address)).to.be.false;
  });

  it("Can't add a controller if caller is not SNOWDirectory owner", async function () {
    const { addrs, snowDirectory, mockJbController } = await setup();

    await expect(
      snowDirectory
        .connect(addrs[0])
        .setIsAllowedToSetFirstController(mockJbController.address, true),
    ).to.revertedWith('Ownable: caller is not the owner');
  });
});
