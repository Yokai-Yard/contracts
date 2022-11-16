// SPDX-License-Identifier: MIT
pragma solidity 0.8.6;

import './helpers/TestBaseWorkflow.sol';

contract TestLaunchProject is TestBaseWorkflow {
  SNOWController controller;
  SNOWProjectMetadata _projectMetadata;
  SNOWFundingCycleData _data;
  SNOWFundingCycleMetadata _metadata;
  SNOWGroupedSplits[] _groupedSplits; // Default empty
  SNOWFundAccessConstraints[] _fundAccessConstraints; // Default empty
  ISNOWPaymentTerminal[] _terminals; // Default empty

  function setUp() public override {
    super.setUp();

    controller = snowController();

    _projectMetadata = SNOWProjectMetadata({content: 'myIPFSHash', domain: 1});

    _data = SNOWFundingCycleData({
      duration: 14,
      weight: 1000 * 10**18,
      discountRate: 450000000,
      ballot: ISNOWFundingCycleBallot(address(0))
    });

    _metadata = SNOWFundingCycleMetadata({
      global: SNOWGlobalFundingCycleMetadata({allowSetTerminals: false, allowSetController: false}),
      reservedRate: 5000, //50%
      redemptionRate: 5000, //50%
      ballotRedemptionRate: 0,
      pausePay: false,
      pauseDistributions: false,
      pauseRedeem: false,
      pauseBurn: false,
      allowMinting: false,
      allowChangeToken: false,
      allowTerminalMigration: false,
      allowControllerMigration: false,
      holdFees: false,
      useTotalOverflowForRedemptions: false,
      useDataSourceForPay: false,
      useDataSourceForRedeem: false,
      dataSource: address(0)
    });
  }

  function testLaunchProject() public {
    uint256 projectId = controller.launchProjectFor(
      msg.sender,
      _projectMetadata,
      _data,
      _metadata,
      block.timestamp,
      _groupedSplits,
      _fundAccessConstraints,
      _terminals,
      ''
    );

    SNOWFundingCycle memory fundingCycle = snowFundingCycleStore().currentOf(projectId); //, latestConfig);

    assertEq(fundingCycle.number, 1);
    assertEq(fundingCycle.weight, 1000 * 10**18);
  }

  function testLaunchProjectFuzzWeight(uint256 WEIGHT) public {
    _data = SNOWFundingCycleData({
      duration: 14,
      weight: WEIGHT,
      discountRate: 450000000,
      ballot: ISNOWFundingCycleBallot(address(0))
    });

    uint256 projectId;

    // expectRevert on the next call if weight overflowing
    if (WEIGHT > type(uint88).max) {
      evm.expectRevert(abi.encodeWithSignature('INVALID_WEIGHT()'));

      projectId = controller.launchProjectFor(
        msg.sender,
        _projectMetadata,
        _data,
        _metadata,
        block.timestamp,
        _groupedSplits,
        _fundAccessConstraints,
        _terminals,
        ''
      );
    } else {
      projectId = controller.launchProjectFor(
        msg.sender,
        _projectMetadata,
        _data,
        _metadata,
        block.timestamp,
        _groupedSplits,
        _fundAccessConstraints,
        _terminals,
        ''
      );

      SNOWFundingCycle memory fundingCycle = snowFundingCycleStore().currentOf(projectId); //, latestConfig);

      assertEq(fundingCycle.number, 1);
      assertEq(fundingCycle.weight, WEIGHT);
    }
  }
}
