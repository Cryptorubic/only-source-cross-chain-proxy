// // SPDX-License-Identifier: MIT

// pragma solidity ^0.8.4;

// import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
// import 'hardhat/console.sol';

// interface ITestCrossChain {
//     function swapToken(
//         address _inputToken,
//         uint256 _inputAmount,
//         uint256 _chainId
//     ) external;

//     function swapNative(uint256 _inputAmount, uint256 _chainId) external payable;
// }

// contract TestCrossChain is ITestCrossChain {
//     event Swap(address sender, address token, uint256 amount, uint256 chainId);

//     function swapToken(
//         address _inputToken,
//         uint256 _inputAmount,
//         uint256 _chainId
//     ) external {
//         IERC20(_inputToken).transferFrom(msg.sender, address(this), _inputAmount);

//         emit Swap(msg.sender, _inputToken, _inputAmount, _chainId);
//     }

//     function swapNative(uint256 _inputAmount, uint256 _chainId) external payable {
//         require(msg.value >= _inputAmount);
//         emit Swap(msg.sender, address(0), _inputAmount, _chainId);
//     }

//     bytes4 private constant FUNC_SELECTOR = bytes4(keccak256('swapToken(address,uint256,uint256)'));
//     bytes4 private constant FUNC_SELECTOR_NATIVE = bytes4(keccak256('swapNative(uint256,uint256)'));

//     function viewEncode(
//         address _inputToken,
//         uint256 _inputAmount,
//         uint256 _chainId
//     ) external view returns (bytes memory) {
//         bytes memory data = abi.encodeWithSelector(FUNC_SELECTOR, _inputToken, _inputAmount, _chainId);
//         return data;
//     }

//     function viewEncodeNative(uint256 _inputAmount, uint256 _chainId) external view returns (bytes memory) {
//         bytes memory data = abi.encodeWithSelector(FUNC_SELECTOR_NATIVE, _inputAmount, _chainId);
//         return data;
//     }
// }
