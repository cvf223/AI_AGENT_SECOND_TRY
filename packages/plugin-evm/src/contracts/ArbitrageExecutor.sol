// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@aave/core-v3/contracts/flashloan/base/FlashLoanSimpleReceiverBase.sol";
import "@aave/core-v3/contracts/interfaces/IPool.sol";

contract ArbitrageExecutor is FlashLoanSimpleReceiverBase {
    using SafeERC20 for IERC20;

    address public owner;
    IPool public immutable pool;

    constructor(address _pool) FlashLoanSimpleReceiverBase(_pool) {
        owner = msg.sender;
        pool = IPool(_pool);
    }

    function executeArbitrage(bytes[] memory transactions) external {
        require(msg.sender == owner, "Only owner can execute");
        // The actual arbitrage execution will be handled by the flash loan callback
    }

    function executeOperation(
        address[] calldata assets,
        uint256[] calldata amounts,
        uint256[] calldata premiums,
        address initiator,
        bytes calldata params
    ) external override returns (bool) {
        require(msg.sender == address(pool), "Only pool can call");
        require(initiator == address(this), "Invalid initiator");

        // Decode the arbitrage transactions
        (bytes[] memory transactions) = abi.decode(params, (bytes[]));

        // Execute each transaction in sequence
        for (uint i = 0; i < transactions.length; i++) {
            (bool success, ) = address(this).call(transactions[i]);
            require(success, "Transaction failed");
        }

        // Approve the pool to pull the amount + premium
        for (uint i = 0; i < assets.length; i++) {
            uint256 amountOwing = amounts[i] + premiums[i];
            IERC20(assets[i]).approve(address(pool), amountOwing);
        }

        return true;
    }

    // Emergency function to withdraw any stuck tokens
    function emergencyWithdraw(address token, uint256 amount) external {
        require(msg.sender == owner, "Only owner can withdraw");
        IERC20(token).safeTransfer(owner, amount);
    }
} 