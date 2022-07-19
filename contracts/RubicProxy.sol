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

import 'rubic-bridge-base/contracts/architecture/OnlySourceFunctionality.sol';
import 'rubic-bridge-base/contracts/libraries/SmartApprove.sol';

error DifferentAmountSpent();
error RouterNotAvailable();

/**
    @title RubicProxy
    @author Vladislav Yaroshuk t.me/grgred
    @author George Eliseev
    @notice Universal proxy contract to Symbiosis, LiFi, deBridge and other cross-chain solutions
 */
contract RubicProxy is OnlySourceFunctionality {
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;
    using SafeERC20Upgradeable for IERC20Upgradeable;

    constructor(
        uint256 _fixedCryptoFee,
        address[] memory _routers,
        address[] memory _tokens,
        uint256[] memory _minTokenAmounts,
        uint256[] memory _maxTokenAmounts,
        uint256 _RubicPlatformFee
    ) {
        initialize(
            _fixedCryptoFee,
            _routers,
            _tokens,
            _minTokenAmounts,
            _maxTokenAmounts,
            _RubicPlatformFee
        );
    }

    function initialize(
        uint256 _fixedCryptoFee,
        address[] memory _routers,
        address[] memory _tokens,
        uint256[] memory _minTokenAmounts,
        uint256[] memory _maxTokenAmounts,
        uint256 _RubicPlatformFee
    ) private initializer {
        __OnlySourceFunctionalityInit(
            _fixedCryptoFee,
            _routers,
            _tokens,
            _minTokenAmounts,
            _maxTokenAmounts,
            _RubicPlatformFee
        );
    }

    function providerCall(
        BaseCrossChainParams calldata _params,
        address _router,
        address _gateway,
        bytes calldata _data
    )
        external
        payable
        nonReentrant
        whenNotPaused
        eventEmitter(_params)
    {
//        if (!availableRouters.contains(_router) || !availableRouters.contains(_gateway)) {
//            revert('');
//        }
//        cheaper?
        if (!(availableRouters.contains(_router) && availableRouters.contains(_gateway))) {
            revert RouterNotAvailable();
        }

        IntegratorFeeInfo memory _info = integratorToFeeInfo[_params.integrator];

        IERC20Upgradeable(_params.srcInputToken).safeTransferFrom(msg.sender, address(this), _params.srcInputAmount);

        //uint256 _providerFee = msg.value - accrueFixedCryptoFee(_params.integrator, _info); // collect fixed fee

        uint256 _amountIn = accrueTokenFees(
            _params.integrator,
            _info,
            _params.srcInputAmount,
            0,
            _params.srcInputToken
        );

        SmartApprove.smartApprove(_params.srcInputToken, _amountIn, _gateway);

        uint256 balanceBefore = IERC20Upgradeable(_params.srcInputToken).balanceOf(address(this));

        AddressUpgradeable.functionCallWithValue(_router, _data, accrueFixedCryptoFee(_params.integrator, _info));

        if (balanceBefore - IERC20Upgradeable(_params.srcInputToken).balanceOf(address(this)) != _amountIn) {
            revert DifferentAmountSpent();
        }
    }

    function providerCallNative(
        BaseCrossChainParams calldata _params,
        address _router,
        bytes calldata _data
    )
        external
        payable
        nonReentrant
        whenNotPaused
        eventEmitter(_params)
    {
        if (!availableRouters.contains(_router)) {
            revert RouterNotAvailable();
        }

        IntegratorFeeInfo memory _info = integratorToFeeInfo[_params.integrator];

        uint256 _amountIn = accrueTokenFees(
            _params.integrator,
            _info,
            accrueFixedCryptoFee(_params.integrator, _info),
            0,
            address(0)
        );

        AddressUpgradeable.functionCallWithValue(_router, _data, _amountIn);
    }

    function sweepTokens(address _token, uint256 _amount) external onlyAdmin {
        sendToken(_token, _amount, msg.sender);
    }
}
