package com.gamedozer.battalion.game.actions
{
   import com.gamedozer.battalion.BattalionMain;
   import com.gamedozer.battalion.audio.SoundSystem;
   import com.gamedozer.battalion.data.*;
   import com.gamedozer.battalion.display.GameSpriteScroller;
   import com.gamedozer.battalion.game.*;
   import com.gamedozer.battalion.game.controllers.HumanController;
   import com.gamedozer.battalion.game.triggers.*;
   import com.gamedozer.battalion.ui.ResourcesGainedEffect;
   import com.gamedozer.battalion.ui.StartTurnAnimation;
   import flash.display.DisplayObject;
   
   public class StartTurnAction extends Action
   {
      
      private static var s_avatarIcon:DisplayObject = null;
      
      public function StartTurnAction()
      {
         super(arguments);
         setIsNetworked(false);
      }
      
      private function doFire() : void
      {
         var unit:Unit = null;
         var healPerc:Number = NaN;
         var radarRange:int = 0;
         var area:Array = null;
         var j:int = 0;
         var hp:Number = NaN;
         var cStructures:Array = null;
         var res:int = 0;
         var cStructure:Tile = null;
         var resourcesGained:int = 0;
         var resourcesGainedEffect:ResourcesGainedEffect = null;
         var capture:Boolean = false;
         var structureController:int = 0;
         var captureTerrainAction:CaptureTerrainAction = null;
         super.update();
         var controller:Controller = GameManager.getInstance().getActiveController();
         (GameManager.getInstance() as Object).payFactoryIncome(controller);
         if(controller is HumanController)
         {
            SoundSystem.instance.playSound(new StartTurn());
         }
         var startTurnAnimation:StartTurnAnimation = new StartTurnAnimation(controller.getName(),GameManager.getInstance().getRound() + 1,controller.getTeam().getColor());
         GameManager.getInstance().getSprite().addChild(startTurnAnimation);
         var avatar:DisplayObject = controller.getTeam().createAvatar();
         if(s_avatarIcon != null)
         {
            s_avatarIcon.parent.removeChild(s_avatarIcon);
         }
         s_avatarIcon = avatar;
         GameManager.getInstance().getSprite().addChild(s_avatarIcon);
         s_avatarIcon.x = BattalionMain.WIDTH - s_avatarIcon.width - 4;
         s_avatarIcon.y = 239;
         var units:Array = controller.getUnits();
         for(var i:int = 0; i < units.length; i++)
         {
            unit = units[i];
            if(unit.isDeployed() && unit.isAlive())
            {
               unit.reset();
               unit.takeDamage(GameManager.getInstance().tileAt(unit.getX(),unit.getY()).getTerrain().applyModifiers("damage",unit,0));
               if(!unit.isAlive())
               {
                  TriggerManager.getInstance().add(new KillUnitTrigger(unit.getX(),unit.getY(),unit));
                  GameManager.getInstance().removeUnit(unit);
               }
               if(unit.isRepairing())
               {
                  if(unit.getHealth() < unit.getUnitData().getHealth())
                  {
                     healPerc = GameManager.getInstance().healPercentage(unit);
                     unit.healDamage(unit.getUnitData().getHealth() * healPerc);
                     unit.setRepairing(false);
                  }
               }
               if(!unit.isCloaked() || GameManager.getInstance().isAlliedToThePlayer(unit.getController()))
               {
                  GameManager.getInstance().getCamera().setTarget(unit.getGameUnit());
               }
               if(unit.getUnitData().getName() != "Blockade")
               {
                  radarRange = unit.getUnitData().applyModifiers("radar",unit,1);
                  area = GameManager.getInstance().unitsInRange(unit,-1,-1,1,radarRange);
                  for(j = 0; j < area.length; j++)
                  {
                     if(!area[j].getController().isAllied(unit.getController()))
                     {
                        if(area[j].getUnitData().hasModifier("Cloaking"))
                        {
                           area[j].setCloaked(false);
                        }
                     }
                  }
               }
               if(unit.getUnitData().hasModifier("Cloaking"))
               {
                  if(unit.isCloaked())
                  {
                     unit.getUnitData().addTemporaryModifier(ModifierManager.getInstance().get("Cloak Damage"));
                  }
               }
            }
         }
         units = GameManager.getInstance().getUnits();
         for(i = 0; i < units.length; i++)
         {
            unit = units[i];
            if(unit.isDeployed() && unit.isAlive())
            {
               unit.fixFacingDirection(controller == unit.getController());
               hp = unit.getUnitData().applyModifiers("heal",unit,0);
               if(hp > 0 && unit.getController() == controller)
               {
                  if(unit.getHealth() < unit.getUnitData().getHealth())
                  {
                     unit.healDamage(hp);
                  }
               }
            }
         }
         var controllers:Array = GameManager.getInstance().getControllers();
         for(i = 0; i < controllers.length; i++)
         {
            if(controllers[i] != null)
            {
               cStructures = controllers[i].getStructures();
               res = 0;
               for(j = 0; j < cStructures.length; j++)
               {
                  cStructure = cStructures[j];
                  resourcesGained = cStructure.takeResources(1 / controllers.length);
                  res += resourcesGained;
                  if(resourcesGained > 0)
                  {
                     resourcesGainedEffect = new ResourcesGainedEffect(resourcesGained);
                     resourcesGainedEffect.x = cStructure.getGameTile().x + BattalionMain.TILE_WIDTH / 2;
                     resourcesGainedEffect.y = cStructure.getGameTile().y + BattalionMain.TILE_HEIGHT / 2;
                     GameManager.getInstance().getGameSpriteScroller().add(resourcesGainedEffect,GameSpriteScroller.ABOVE_ALL);
                  }
               }
               if(controllers[i] == controller)
               {
                  for(j = 0; j < cStructures.length; j++)
                  {
                     if(cStructures[j].getTerrain().hasModifier("Mission Critical"))
                     {
                        GameManager.getInstance().getCamera().setTarget(cStructures[j].getGameTile());
                     }
                  }
               }
               res = Math.round(res * controllers[i].getDifficultyResourcesScale());
               controllers[i].addResources(res);
               controllers[i].getTeam().addStatistic(Team.RESOURCES_COLLECTED,res);
               TriggerManager.getInstance().add(new ResourcesAcquiredTrigger(GameManager.getInstance().getPlayer(controllers[i]),res));
            }
         }
         var structures:Array = GameManager.getInstance().getStructures();
         for(i = 0; i < structures.length; i++)
         {
            unit = structures[i].getUnit();
            capture = false;
            if(unit != null)
            {
               structureController = GameManager.getInstance().getControllerIndex(structures[i].getController());
               if(unit.isDeployed() && unit.isAlive() && !unit.getController().getTeam().isAllied(structureController))
               {
                  if(unit.getUnitData().hasModifier("Capture"))
                  {
                     capture = true;
                     if(controller.controlsUnit(unit))
                     {
                        captureTerrainAction = new CaptureTerrainAction(structures[i].getX(),structures[i].getY());
                        captureTerrainAction.setIsNetworked(false);
                        ActionManager.getInstance().add(captureTerrainAction,true);
                     }
                  }
               }
            }
            if(!capture)
            {
               structures[i].setChunks(GameManager.TILE_CHUNKS);
               structures[i].setCapturer(null);
            }
         }
         controller.setCamera();
         var t:SendTriggerAction = new SendTriggerAction(new PlayerTrigger(PlayerTrigger.START_TURN,GameManager.getInstance().getCurrentController()));
         ActionManager.getInstance().add(t,true);
      }
      
      override public function update() : void
      {
      }
      
      override public function toXML() : XML
      {
         var actionXML:XML = super.toXML();
         var x:XML = <StartTurnAction/>;
         actionXML.appendChild(x);
         return actionXML;
      }
      
      override public function fire() : void
      {
         super.fire();
         doFire();
      }
   }
}

