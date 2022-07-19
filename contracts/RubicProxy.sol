// SPDX-License-Identifier: MIT

pragma solidity ^0.8.10;

/**

  ██████╗ ██╗   ██╗██████╗ ██╗ ██████╗    ██████╗ ██████╗  ██████╗ ██╗  ██╗██╗   ██╗
  ██╔══██╗██║   ██║██╔══██╗██║██╔════╝    ██╔══██╗██╔══██╗██╔═══██╗╚██╗██╔╝╚██╗ ██╔╝
  ██████╔╝██║   ██║██████╔╝██║██║         ██████╔╝██████╔╝██║   ██║ ╚███╔╝  ╚████╔╝
  ██╔══██╗██║   ██║██╔══██╗██║██║         ██╔═══╝ ██╔══██╗██║   ██║ ██╔██╗   ╚██╔╝
  ██║  ██║╚██████╔╝██████╔╝██║╚██████╗    ██║     ██║  ██║╚██████╔╝██╔╝ ██╗   ██║
  ╚═╝  ╚═╝ ╚═════╝ ╚═════╝ ╚═╝ ╚═════╝    ╚═╝     ╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝   ╚═╝

*/

import 'rubic-bridge-base/contracts/tokens/MultipleTransitToken.sol';
import 'rubic-bridge-base/contracts/architecture/OnlySourceFunctionality.sol';

error DifferentAmountSpent();

/**
    @title RubicProxy
    @author Vladislav Yaroshuk t.me/grgred
    @author George Eliseev
    @notice Universal proxy contract to Symbiosis, LiFi, deBridge and other cross-chain solutions
 */
contract RubicProxy is MultipleTransitToken, OnlySourceFunctionality {
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;
    using SafeERC20Upgradeable for IERC20Upgradeable;

    address public deBridgeRouter;

    constructor(
        uint256 _fixedCryptoFee,
        address[] memory _routers,
        address[] memory _tokens,
        uint256[] memory _minTokenAmounts,
        uint256[] memory _maxTokenAmounts,
        uint256 _RubicPlatformFee,
        address _deBridgeRouter
    ) {
        initialize(
            _fixedCryptoFee,
            _routers,
            _tokens,
            _minTokenAmounts,
            _maxTokenAmounts,
            _RubicPlatformFee,
            _deBridgeRouter
        );
    }

    function initialize(
        uint256 _fixedCryptoFee,
        address[] memory _routers,
        address[] memory _tokens,
        uint256[] memory _minTokenAmounts,
        uint256[] memory _maxTokenAmounts,
        uint256 _RubicPlatformFee,
        address _deBridgeRouter
    ) private initializer {
        __BridgeBaseInit(_fixedCryptoFee, _routers);
        __MultipleTransitTokenInitUnchained(_tokens, _minTokenAmounts, _maxTokenAmounts);

        __OnlySourceFunctionalityInitUnchained(_RubicPlatformFee);

        deBridgeRouter = _deBridgeRouter;

        _setupRole(MANAGER_ROLE, msg.sender);
    }

    function providerCall(BaseCrossChainParams calldata _params, /** address _router, address _gateway,*/ bytes calldata _data)
        external
        payable
        nonReentrant
        whenNotPaused
        EventEmitter(_params)
    {
        IntegratorFeeInfo memory _info = integratorToFeeInfo[_params.integrator];

        uint256 _providerFee = msg.value - accrueFixedCryptoFee(_params.integrator, _info); // collect fixed fee
        IERC20Upgradeable(_params.srcInputToken).safeTransferFrom(msg.sender, address(this), _params.srcInputAmount);

        uint256 _amountIn = accrueTokenFees(
            _params.integrator,
            _info,
            _params.srcInputAmount,
            0,
            _params.srcInputToken
        );

//        if (!availableRouters.contains(_router) || !availableRouters.contains(_gateway)) {
//            revert('');
//        }
//        cheaper?
//        if (!(availableRouters.contains(_router) && availableRouters.contains(_gateway))) {
//            revert('');
//        }

        smartApprove(_params.srcInputToken, _params.srcInputAmount, deBridgeRouter);

        uint256 balanceBefore = IERC20Upgradeable(_params.srcInputToken).balanceOf(address(this));

        AddressUpgradeable.functionCallWithValue(deBridgeRouter, _data, _providerFee);

        if (balanceBefore - IERC20Upgradeable(_params.srcInputToken).balanceOf(address(this)) != _amountIn) {
            revert DifferentAmountSpent();
        }
    }

    function providerCallNative(BaseCrossChainParams calldata _params, bytes calldata _data)
        external
        payable
        nonReentrant
        whenNotPaused
        EventEmitter(_params)
    {
        uint256 _amountIn = accrueTokenFees(
            _params.integrator,
            integratorToFeeInfo[_params.integrator],
            msg.value - accrueFixedCryptoFee(_params.integrator, integratorToFeeInfo[_params.integrator]), // amountIn - fixedFee - commission
            0,
            address(0)
        );

        AddressUpgradeable.functionCallWithValue(deBridgeRouter, _data, _amountIn);
    }

    function _calculateFee(
        IntegratorFeeInfo memory _info,
        uint256 _amountWithFee,
        uint256
    ) internal view override(BridgeBase, OnlySourceFunctionality) returns (uint256 _totalFee, uint256 _RubicFee) {
        (_totalFee, _RubicFee) = OnlySourceFunctionality._calculateFee(_info, _amountWithFee, 0);
    }

    function setdeBridgeRouter(address _deBridgeRouter) external onlyManagerAndAdmin {
        deBridgeRouter = _deBridgeRouter;
    }

    function sweepTokens(address _token, uint256 _amount) external onlyAdmin {
        _sendToken(_token, _amount, msg.sender);
    }
}
