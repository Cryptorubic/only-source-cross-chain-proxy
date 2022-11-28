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
import '@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol';
import 'rubic-bridge-base/contracts/errors/Errors.sol';
import 'rubic-whitelist-contract/contracts/interfaces/IRubicWhitelist.sol';

error DifferentAmountSpent();
error ProviderNotAvailable(address _router, address _gateway);
error RouterNotAvailable(address _router);

/**
    @title RubicProxy
    @author Vladislav Yaroshuk
    @author George Eliseev
    @notice Universal proxy contract to Symbiosis, LiFi, deBridge and other cross-chain solutions
 */
contract RubicProxy is OnlySourceFunctionality {
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;
    using SafeERC20Upgradeable for IERC20Upgradeable;

    IRubicWhitelist public whitelistRegistry;

    constructor(
        uint256 _fixedCryptoFee,
        uint256 _RubicPlatformFee,
        address[] memory _tokens,
        uint256[] memory _minTokenAmounts,
        uint256[] memory _maxTokenAmounts,
        address _admin,
        IRubicWhitelist _whitelistRegistry
    ) {
        if (address(_whitelistRegistry) == address(0)) {
            revert ZeroAddress();
        }

        whitelistRegistry = _whitelistRegistry;

        initialize(_fixedCryptoFee, _RubicPlatformFee, _tokens, _minTokenAmounts, _maxTokenAmounts, _admin);
    }

    function initialize(
        uint256 _fixedCryptoFee,
        uint256 _RubicPlatformFee,
        address[] memory _tokens,
        uint256[] memory _minTokenAmounts,
        uint256[] memory _maxTokenAmounts,
        address _admin
    ) private initializer {
        __OnlySourceFunctionalityInit(
            _fixedCryptoFee,
            _RubicPlatformFee,
            _tokens,
            _minTokenAmounts,
            _maxTokenAmounts,
            _admin
        );
    }

    function routerCall(
        string calldata _providerInfo,
        BaseCrossChainParams calldata _params,
        address _gateway,
        bytes calldata _data
    ) external payable nonReentrant whenNotPaused eventEmitter(_params, _providerInfo) {
        {
            bool isRouterAvailable = whitelistRegistry.isWhitelistedCrossChain(_params.router);

            if (!(whitelistRegistry.isWhitelistedCrossChain(_gateway))) {
                if (isRouterAvailable) {
                    revert ProviderNotAvailable(address(0), _gateway);
                } else {
                    revert ProviderNotAvailable(_params.router, _gateway);
                }
            } else {
                if (!isRouterAvailable) {
                    revert ProviderNotAvailable(_params.router, address(0));
                }
            }
        }

        uint256 balanceBeforeTransfer = IERC20Upgradeable(_params.srcInputToken).balanceOf(address(this));
        IERC20Upgradeable(_params.srcInputToken).safeTransferFrom(msg.sender, address(this), _params.srcInputAmount);
        uint256 balanceAfterTransfer = IERC20Upgradeable(_params.srcInputToken).balanceOf(address(this));

        // input amount for deflationary tokens
        uint256 _amountIn = balanceAfterTransfer - balanceBeforeTransfer;

        IntegratorFeeInfo memory _info = integratorToFeeInfo[_params.integrator];

        _amountIn = accrueTokenFees(_params.integrator, _info, _amountIn, 0, _params.srcInputToken);

        SafeERC20Upgradeable.safeIncreaseAllowance(IERC20Upgradeable(_params.srcInputToken), _gateway, _amountIn);

        AddressUpgradeable.functionCallWithValue(
            _params.router,
            _data,
            accrueFixedCryptoFee(_params.integrator, _info)
        );

        if (balanceAfterTransfer - IERC20Upgradeable(_params.srcInputToken).balanceOf(address(this)) != _amountIn) {
            revert DifferentAmountSpent();
        }

        // reset allowance back to zero, just in case
        if (IERC20Upgradeable(_params.srcInputToken).allowance(address(this), _gateway) > 0) {
            IERC20Upgradeable(_params.srcInputToken).safeApprove(_gateway, 0);
        }
    }

    function routerCallNative(
        string calldata _providerInfo,
        BaseCrossChainParams calldata _params,
        bytes calldata _data
    ) external payable nonReentrant whenNotPaused eventEmitter(_params, _providerInfo) {
        if (!whitelistRegistry.isWhitelistedCrossChain(_params.router)) {
            revert RouterNotAvailable(_params.router);
        }

        IntegratorFeeInfo memory _info = integratorToFeeInfo[_params.integrator];

        uint256 _amountIn = accrueTokenFees(
            _params.integrator,
            _info,
            accrueFixedCryptoFee(_params.integrator, _info),
            0,
            address(0)
        );

        AddressUpgradeable.functionCallWithValue(_params.router, _data, _amountIn);
    }
}
