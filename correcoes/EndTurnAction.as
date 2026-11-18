package com.gamedozer.battalion.game.actions
{
   import com.gamedozer.battalion.audio.SoundSystem;
   import com.gamedozer.battalion.data.*;
   import com.gamedozer.battalion.game.*;
   import com.gamedozer.battalion.game.controllers.HumanController;
   import com.gamedozer.battalion.ui.StatusUI;
   import flash.geom.*;
   
   public class EndTurnAction extends Action
   {
      
      public static const REASON_VOLUNTARY:int = 0;
      
      public static const REASON_SURRENDER:int = 1;
      
      public static const REASON_IDLE:int = 2;
      
      public static const REASON_NO_UNITS:int = 3;
      
      public static const REASON_DEBUG_ENDGAME:int = 4;
      
      private var m_reason:int;
      
      public function EndTurnAction(a_reason:int)
      {
         m_reason = a_reason;
         super(arguments);
      }
      
      override public function toXML() : XML
      {
         var actionXML:XML = super.toXML();
         var x:XML = <EndTurnAction/>;
         x.@reason = m_reason;
         actionXML.appendChild(x);
         return actionXML;
      }
      
      override public function fire() : void
      {
         var turnsBeforeNotAttackingCausesMoraleLose:int = 0;
         var turnsWeCanNotAttackBeforeWeGetAPenalty:int = 0;
         var moraleLostPerTurn:Number = NaN;
         var unit:Unit = null;
         super.fire();
         var gameManager:GameManager = GameManager.getInstance();
         var controller:Controller = GameManager.getInstance().getActiveController();
         controller.endTurnCleanup();
         (gameManager as Object).payFactoryIncome(controller);
         if(GameManager.getInstance().isMoraleEnabled)
         {
            if(m_reason == REASON_IDLE)
            {
               GameManager.getInstance().changeMorale(controller,MoraleChangeAmounts.DELAY_OF_GAME,MoraleChangeAmounts.DELAY_OF_GAME_DESCRIPTION);
               if(controller is HumanController)
               {
                  StatusUI.getInstance().addMessage("info","Idle Penalty","You took too long to act so your troops lost " + Math.round(MoraleChangeAmounts.DELAY_OF_GAME * 100) + "% morale and your turn was ended.");
               }
            }
            turnsBeforeNotAttackingCausesMoraleLose = 2;
            if(GameManager.getInstance().getRound() >= turnsBeforeNotAttackingCausesMoraleLose)
            {
               turnsWeCanNotAttackBeforeWeGetAPenalty = 2;
               if(controller.turnsSincePlayerAttacked > turnsWeCanNotAttackBeforeWeGetAPenalty)
               {
                  moraleLostPerTurn = (controller.turnsSincePlayerAttacked - turnsWeCanNotAttackBeforeWeGetAPenalty) * MoraleChangeAmounts.PER_TURN_LACK_OF_ATTACK_PENALTY;
                  GameManager.getInstance().changeMorale(controller,moraleLostPerTurn,MoraleChangeAmounts.PER_TURN_LACK_OF_ATTACK_PENALTY_DESCRIPTION);
                  if(controller is HumanController)
                  {
                     StatusUI.getInstance().addMessage("warning","Morale Lost","Troop morale has fallen by " + Math.round(moraleLostPerTurn * 100) + "%. Attack enemy units to prevent additional morale loss next turn.");
                  }
               }
            }
            else
            {
               controller.resetTurnsSinceLastAttackCounter();
            }
         }
         if(controller.movedAUnitThisTurn)
         {
         }
         var units:Array = controller.getUnits();
         for(var i:int = 0; i < units.length; i++)
         {
            unit = units[i];
            unit.getUnitData().clearTemporaryModifiers();
            unit.getGameUnit().transform.colorTransform = new ColorTransform();
            if(unit.isCloaked())
            {
               unit.getGameUnit().alpha = unit.getController().getCloakVisibility();
            }
            if(unit.isDeployed())
            {
               if(unit.getUnitData().hasModifier("Cloaking") && unit.isAvailable())
               {
                  unit.setCloaked(true,false,false);
               }
            }
         }
         do
         {
            gameManager.setTurn(gameManager.getTurn() + 1);
            gameManager.setCurrentController(gameManager.getCurrentController() + 1);
            if(gameManager.getCurrentController() > gameManager.getControllers().length - 1)
            {
               gameManager.setRound(gameManager.getRound() + 1);
               gameManager.setCurrentController(0);
            }
            if(gameManager.getRound() > gameManager.getMapSettings().getRounds())
            {
               ActionManager.getInstance().add(new EndGameAction());
            }
         }
         while(!gameManager.getActiveController().getTeam().getActive());
         var start:StartTurnAction = new StartTurnAction();
         start.setIsNetworked(false);
         ActionManager.getInstance().add(start,true);
         SoundSystem.instance.destroyLoop("warning_alarm");
         GameManager.getInstance().getGameSpriteScroller().sortUnits();
      }
   }
}

