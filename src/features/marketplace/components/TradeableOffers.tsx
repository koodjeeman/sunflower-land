import React, { useContext, useEffect, useState } from "react";

import { Button } from "components/ui/Button";
import { Label } from "components/ui/Label";
import { InnerPanel, Panel } from "components/ui/Panel";
import { Offer, TradeableDetails } from "features/game/types/marketplace";
import { useAppTranslation } from "lib/i18n/useAppTranslations";

import sflIcon from "assets/icons/flower_token.webp";
import increaseArrow from "assets/icons/increase_arrow.png";

import { OfferTable } from "./TradeTable";
import { Loading } from "features/auth/components";
import { Modal } from "components/ui/Modal";
import { useSelector } from "@xstate/react";
import { TradeableDisplay } from "../lib/tradeables";
import {
  BlockchainEvent,
  Context as ContextType,
  MachineState,
} from "features/game/lib/gameMachine";
import { useOnMachineTransition } from "lib/utils/hooks/useOnMachineTransition";
import { Context } from "features/game/GameProvider";
import { MakeOffer } from "./MakeOffer";
import * as Auth from "features/auth/lib/Provider";
import { AcceptOffer } from "./AcceptOffer";
import { AuthMachineState } from "features/auth/lib/authMachine";
import confetti from "canvas-confetti";
import { ResourceTable } from "./ResourceTable";
import { formatNumber } from "lib/utils/formatNumber";
import { getBasketItems } from "features/island/hud/components/inventory/utils/inventory";
import { KNOWN_ITEMS } from "features/game/types";
import { isTradeResource } from "features/game/actions/tradeLimits";

import Decimal from "decimal.js-light";
import { useParams } from "react-router";
import { KeyedMutator } from "swr";
import { MAX_LIMITED_PURCHASES } from "./Tradeable";
import { ResourceTaxes } from "./TradeableInfo";
import { hasVipAccess } from "features/game/lib/vipAccess";
import { useFirstRender } from "lib/utils/hooks/useFirstRender";

const _hasPendingOfferEffect = (state: MachineState) =>
  state.matches("marketplaceOffering") || state.matches("marketplaceAccepting");
const _authToken = (state: AuthMachineState) =>
  state.context.user.rawToken as string;
const _balance = (state: MachineState) => state.context.state.balance;
const _inventory = (state: MachineState) => state.context.state.inventory;
const _myOffersCount = (state: MachineState) =>
  Object.keys(state.context.state.trades.offers ?? {}).length;

export const TradeableOffers: React.FC<{
  tradeable?: TradeableDetails;
  limitedTradesLeft: number;
  limitedPurchasesLeft: number;
  farmId: number;
  display: TradeableDisplay;
  itemId: number;
  reload: KeyedMutator<TradeableDetails>;
}> = ({
  tradeable,
  limitedTradesLeft,
  farmId,
  display,
  itemId,
  reload,
  limitedPurchasesLeft,
}) => {
  const { authService } = useContext(Auth.Context);
  const { gameService, showAnimations } = useContext(Context);
  const { t } = useAppTranslation();
  const { id } = useParams();

  const usd = gameService.getSnapshot().context.prices.sfl?.usd ?? 0.0;

  useOnMachineTransition<ContextType, BlockchainEvent>(
    gameService,
    "marketplaceOfferingSuccess",
    "playing",
    reload,
  );

  useOnMachineTransition<ContextType, BlockchainEvent>(
    gameService,
    "marketplaceOffering",
    "marketplaceOfferingSuccess",
  );

  const hasPendingOfferEffect = useSelector(
    gameService,
    _hasPendingOfferEffect,
  );
  const authToken = useSelector(authService, _authToken);
  const balance = useSelector(gameService, _balance);
  const inventory = useSelector(gameService, _inventory);
  const myOffersCount = useSelector(gameService, _myOffersCount);
  const [showMakeOffer, setShowMakeOffer] = useState(false);
  const [showAcceptOffer, setShowAcceptOffer] = useState(false);
  const [selectedOffer, setSelectedOffer] = useState<Offer>();

  const topOffer = tradeable?.offers.reduce((highest, offer) => {
    return offer.sfl > highest.sfl ? offer : highest;
  }, tradeable?.offers[0]);

  const isFirstRender = useFirstRender();

  useOnMachineTransition<ContextType, BlockchainEvent>(
    gameService,
    "marketplaceOfferCancellingSuccess",
    "playing",
    reload,
  );

  useOnMachineTransition<ContextType, BlockchainEvent>(
    gameService,
    "marketplaceAcceptingSuccess",
    "playing",
    () => {
      reload();
      if (showAnimations) confetti();
    },
  );

  useOnMachineTransition<ContextType, BlockchainEvent>(
    gameService,
    "loading",
    "playing",
    () =>
      reload(undefined, {
        optimisticData: tradeable
          ? {
              ...tradeable,
              offers:
                tradeable?.offers?.filter(
                  (offer) => selectedOffer?.tradeId !== offer.tradeId,
                ) ?? [],
            }
          : undefined,
      }),
  );

  useEffect(() => {
    if (isFirstRender) return;

    reload();
  }, [myOffersCount, isFirstRender, reload]);

  const handleHide = () => {
    if (hasPendingOfferEffect) return;

    setShowMakeOffer(false);
  };

  const handleSelectOffer = (id: string) => {
    const selectedOffer = tradeable?.offers.find(
      (offer) => offer.tradeId === id,
    ) as Offer;

    setSelectedOffer(selectedOffer);
    setShowAcceptOffer(true);
  };

  const loading = !tradeable;
  const isResource = isTradeResource(KNOWN_ITEMS[Number(id)]);

  const vipIsRequired =
    tradeable?.isVip &&
    !hasVipAccess({
      game: gameService.getSnapshot().context.state,
    });

  return (
    <>
      <Modal show={showMakeOffer} onHide={handleHide}>
        <Panel>
          <MakeOffer
            itemId={itemId}
            authToken={authToken}
            display={display}
            floorPrice={tradeable?.floor ?? 0}
            onClose={() => setShowMakeOffer(false)}
          />
        </Panel>
      </Modal>
      <Modal show={showAcceptOffer} onHide={handleHide}>
        <Panel className="mb-1">
          <AcceptOffer
            authToken={authToken}
            itemId={itemId}
            display={display}
            offer={(isResource ? selectedOffer : topOffer) as Offer}
            onClose={() => setShowAcceptOffer(false)}
            onOfferAccepted={reload}
          />
        </Panel>
        {isResource && <ResourceTaxes />}
      </Modal>
      {!isResource && (
        <InnerPanel className="mb-1">
          <div className="p-2 pb-0 mb-2">
            <div className="flex justify-between mb-2">
              <Label type="default" icon={increaseArrow}>
                {t("marketplace.offers")}
              </Label>
              {tradeable?.expiresAt && (
                <Label type={limitedPurchasesLeft <= 0 ? "danger" : "warning"}>
                  {`${limitedPurchasesLeft}/${MAX_LIMITED_PURCHASES} Offers left`}
                </Label>
              )}
            </div>
            <div className="flex w-full flex-col sm:flex-row items-center justify-between">
              {topOffer ? (
                <div className="flex w-full mb-2 sm:mb-0 items-center">
                  <img src={sflIcon} className="h-8 mr-2" />
                  <div>
                    <p className="text-base">{`${topOffer.sfl} FLOWER`}</p>
                    <p className="text-xxs">
                      {`$${new Decimal(usd).mul(topOffer.sfl).toFixed(2)}`}
                    </p>
                  </div>
                </div>
              ) : !loading && tradeable?.offers.length === 0 ? (
                <p className="text-sm self-end mb-2 text-left">
                  {t("marketplace.noOffers")}
                </p>
              ) : (
                <div />
              )}
              {!loading && (
                <div className="flex items-center w-full sm:w-fit">
                  {tradeable?.isActive && !vipIsRequired && (
                    <Button
                      className="w-full sm:w-fit mr-1"
                      disabled={
                        !tradeable ||
                        !tradeable?.isActive ||
                        limitedPurchasesLeft <= 0
                      }
                      onClick={() => setShowMakeOffer(true)}
                    >
                      <span className="whitespace-nowrap text-xs sm:text-sm">
                        {t("marketplace.makeOffer")}
                      </span>
                    </Button>
                  )}

                  {topOffer && tradeable?.isActive && !vipIsRequired && (
                    <Button
                      disabled={
                        topOffer.offeredBy.id === farmId ||
                        limitedTradesLeft <= 0
                      }
                      onClick={() => setShowAcceptOffer(true)}
                      className="w-full sm:w-fit"
                    >
                      <span className="whitespace-nowrap text-xs sm:text-sm">
                        {t("marketplace.acceptOffer")}
                      </span>
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>

          {loading ? (
            <Loading className="mb-2 ml-2" />
          ) : (
            <OfferTable
              isResource={isResource}
              details={display}
              offers={tradeable?.offers ?? []}
              id={farmId}
            />
          )}
        </InnerPanel>
      )}

      {isResource && (
        <InnerPanel className="mb-1">
          <div className="p-2">
            <div className="flex justify-between mb-2 mr-2">
              <Label type="default" icon={increaseArrow}>
                {t("marketplace.offers")}
              </Label>
            </div>
            <div className="mb-2">
              {loading && <Loading />}
              {!loading && tradeable?.offers.length === 0 && (
                <p className="text-sm">{t("marketplace.noOffers")}</p>
              )}
              {!!tradeable?.offers.length && (
                <ResourceTable
                  isResource={isResource}
                  details={display}
                  balance={balance}
                  items={tradeable?.offers.map((offer) => ({
                    id: offer.tradeId,
                    price: offer.sfl,
                    quantity: offer.quantity,
                    pricePerUnit: Number(
                      formatNumber(offer.sfl / offer.quantity, {
                        decimalPlaces: 4,
                      }),
                    ),
                    createdBy: offer.offeredBy,
                  }))}
                  inventoryCount={
                    getBasketItems(inventory)[
                      KNOWN_ITEMS[itemId]
                    ]?.toNumber() ?? 0
                  }
                  id={farmId}
                  tableType="offers"
                  onClick={
                    tradeable.isActive && !vipIsRequired
                      ? (offerId) => {
                          handleSelectOffer(offerId);
                          setShowAcceptOffer(true);
                        }
                      : undefined
                  }
                />
              )}
            </div>
          </div>
          <div className="w-full justify-end flex sm:pb-2 sm:pr-2">
            <Button
              className="w-full sm:w-fit"
              onClick={() => setShowMakeOffer(true)}
            >
              {t("marketplace.makeOffer")}
            </Button>
          </div>
        </InnerPanel>
      )}
    </>
  );
};
