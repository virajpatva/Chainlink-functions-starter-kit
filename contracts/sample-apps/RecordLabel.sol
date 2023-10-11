// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {FunctionsClient} from "@chainlink/contracts/src/v0.8/functions/dev/v1_0_0/FunctionsClient.sol";
import {ConfirmedOwner} from "@chainlink/contracts/src/v0.8/shared/access/ConfirmedOwner.sol";
import {FunctionsRequest} from "@chainlink/contracts/src/v0.8/functions/dev/v1_0_0/libraries/FunctionsRequest.sol";

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

// TODO @Zubin disable solhint
// import "hardhat/console.sol"; // NOTE: console.log only works in Hardhat local networks and the local functions simluation, not on testnets or mainnets.

interface IStableCoin is IERC20 {
  function mint(address to, uint256 amount) external;

  function decimals() external returns (uint8);
}

/**
 * @title Functions Copns contract
 * @notice This contract is a demonstration of using Functions.
 * @notice NOT FOR PRODUCTION USE
 */
contract RecordLabel is FunctionsClient, ConfirmedOwner {
  using FunctionsRequest for FunctionsRequest.Request;

  bytes32 public latestRequestId;
  bytes public latestResponse;
  bytes public latestError;
  string public latestArtistRequestedId;

  address public s_stc; // SimpleStableCoin address for payouts.

  bytes32 public donId; // DON ID for the Functions DON to which the requests are sent

  error RecordLabel_ArtistPaymentError(string artistId, uint256 payment, string errorMsg);

  struct Artist {
    string name;
    string email;
    string artistId;
    uint256 lastListenerCount;
    uint256 lastPaidAmount;
    uint256 totalPaid;
    address walletAddress;
  }

  mapping(string => Artist) artistData; // Mapping that uses the ArtistID as the key.

  event OCRResponse(bytes32 indexed requestId, bytes result, bytes err);
  event ArtistPaid(string artistId, uint256 amount);

  constructor(address router, bytes32 _donId, address stablecoin) FunctionsClient(router) ConfirmedOwner(msg.sender) {
    donId = _donId;
    s_stc = stablecoin;
  }

  /**
   * @notice Triggers an on-demand Functions request using remote encrypted secrets
   * @param source JavaScript source code
   * @param secretsLocation Location of secrets (only Location.Remote & Location.DONHosted are supported)
   * @param encryptedSecretsReference Reference pointing to encrypted secrets
   * @param args String arguments passed into the source code and accessible via the global variable `args`
   * @param bytesArgs Bytes arguments passed into the source code and accessible via the global variable `bytesArgs` as hex strings
   * @param subscriptionId Subscription ID used to pay for request (FunctionsConsumer contract address must first be added to the subscription)
   * @param callbackGasLimit Maximum amount of gas used to call the inherited `handleOracleFulfillment` method
   */
  function sendRequest(
    string calldata source,
    FunctionsRequest.Location secretsLocation,
    bytes calldata encryptedSecretsReference,
    string[] calldata args,
    bytes[] calldata bytesArgs,
    uint64 subscriptionId,
    uint32 callbackGasLimit
  ) external onlyOwner {
    FunctionsRequest.Request memory req;
    req.initializeRequest(FunctionsRequest.Location.Inline, FunctionsRequest.CodeLanguage.JavaScript, source);
    req.secretsLocation = secretsLocation;
    req.encryptedSecretsReference = encryptedSecretsReference;
    if (args.length > 0) {
      req.setArgs(args);
    }
    if (bytesArgs.length > 0) {
      req.setBytesArgs(bytesArgs);
    }
    latestRequestId = _sendRequest(req.encodeCBOR(), subscriptionId, callbackGasLimit, donId);
    latestArtistRequestedId = args[0];
  }

  /**
   * @notice Callback that is invoked once the DON has resolved the request or hit an error
   *
   * @param requestId The request ID, returned by sendRequest()
   * @param response Aggregated response from the user code
   * @param err Aggregated error from the user code or from the execution pipeline
   * Either response or error parameter will be set, but never both
   */
  function fulfillRequest(bytes32 requestId, bytes memory response, bytes memory err) internal override {
    latestResponse = response;
    latestError = err;
    emit OCRResponse(requestId, response, err);

    // Artist contract for payment logic here.
    // Artist gets a fixed rate for every addition 1000 active monthly listeners.
    bool nilErr = (err.length == 0);
    if (nilErr) {
      int256 latestListenerCount = abi.decode(response, (int256));

      string memory artistId = latestArtistRequestedId;
      uint256 lastListenerCount = artistData[artistId].lastListenerCount;

      int256 diffListenerCount = latestListenerCount - int256(lastListenerCount);
      if (diffListenerCount <= 0) {
        // No payments due.
        return;
      }

      // Pay the artist at 'artistData[latestArtistRequestedId].walletAddress'.
      uint8 stcDecimals = IStableCoin(s_stc).decimals();
      // Artist gets 1 STC per  10000 additional streams.
      uint256 amountDue = (uint256(diffListenerCount) * 1 * 10 ** stcDecimals) / 10000;

      payArtist(artistId, amountDue);

      // Update Artist Mapping.
      artistData[artistId].lastListenerCount = uint256(latestListenerCount);
      artistData[artistId].lastPaidAmount = amountDue;
      artistData[artistId].totalPaid += amountDue;
    }
  }

  function setArtistData(
    string memory artistId,
    string memory name,
    string memory email,
    uint256 lastListenerCount,
    uint256 lastPaidAmount,
    uint256 totalPaid,
    address walletAddress
  ) public onlyOwner {
    artistData[artistId].artistId = artistId;
    artistData[artistId].name = name;
    artistData[artistId].email = email;
    artistData[artistId].lastListenerCount = lastListenerCount;
    artistData[artistId].lastPaidAmount = lastPaidAmount;
    artistData[artistId].totalPaid = totalPaid;
    artistData[artistId].walletAddress = walletAddress;
  }

  function payArtist(string memory artistId, uint256 amountDue) internal {
    IStableCoin token = IStableCoin(s_stc);
    if (artistData[artistId].walletAddress == address(0)) {
      revert RecordLabel_ArtistPaymentError(artistId, amountDue, "Artist has no wallet associated.");
    }

    token.transferFrom(owner(), artistData[artistId].walletAddress, amountDue);
    emit ArtistPaid(artistId, amountDue);
  }

  function getArtistData(string memory artistId) public view returns (Artist memory) {
    return artistData[artistId];
  }

  // Utility Functions
  function updateDonId(bytes32 _donId) public onlyOwner {
    donId = _donId;
  }

  function updateStableCoinAddress(address stc) public onlyOwner {
    s_stc = stc;
  }
}
