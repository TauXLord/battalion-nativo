package com.gamedozer.battalion.game
{
   import com.gamedozer.battalion.*;
   import com.gamedozer.battalion.audio.*;
   import com.gamedozer.battalion.data.*;
   import com.gamedozer.battalion.display.*;
   import com.gamedozer.battalion.display.tween.*;
   import com.gamedozer.battalion.game.actions.*;
   import com.gamedozer.battalion.game.conditions.*;
   import com.gamedozer.battalion.game.controllers.*;
   import com.gamedozer.battalion.game.responses.*;
   import com.gamedozer.battalion.game.triggers.*;
   import com.gamedozer.battalion.ui.*;
   import com.gamedozer.battalion.utils.*;
   import com.robertpenner.easing.*;
   import flash.display.*;
   import flash.text.*;
   import flash.ui.*;
   import flash.utils.*;
   
   public class GameManager
   {
      
      private static var singleton:GameManager;

      public static var localScenario:Boolean = false;

      public static var privateTurns:Boolean = false;
      
      public static const UNIT_CHUNKS:int = 4;
      
      public static const TILE_CHUNKS:int = 8;
      
      public static const GAME_WIDTH:int = 560;
      
      public static const GAME_HEIGHT:int = 560;
      
      protected var m_leaveGameButton:TileSheetButton;
      
      protected var m_units:Array;
      
      protected var m_killerSuggestionEngine:KillerSuggestionEngine;
      
      protected var m_surrenderedControllers:Array;
      
      protected var camera:GameCamera;
      
      protected var nextUnitButton:TileSheetButton;
      
      protected var endTurnButton:TileSheetButton;
      
      protected var controllers:Array;
      
      protected var structures:Array;
      
      protected var turn:int;
      
      protected var miniMap:MiniMap;
      
      protected var round:int;
      
      private var m_goodLoop:String;
      
      protected var m_statusUI:StatusUI;
      
      protected var m_isMoraleEnabled:Boolean;
      
      protected var mapSettings:MapSettings;
      
      protected var playerPanel:AllPlayerPanel;
      
      protected var parent:GameMenu;
      
      protected var mDown:Boolean;
      
      protected var gameSpriteScroller:GameSpriteScroller;
      
      private var m_idleTimerLabel:DefaultTextField;
      
      protected var m_loadingPanel:LoadingPanel;
      
      protected var sprite:Sprite;
      
      protected var m_isSoloGame:Boolean;
      
      protected var tileMap:Array;
      
      protected var reconPanel:ReconPanel;
      
      protected var ballisticsTable:Array;
      
      protected var movementCombiner:MovementCombiner;
      
      private var m_evilLoop:String;
      
      protected var currentController:int;
      
      protected var m_moveUndoButton:TileSheetButton;
      
      protected var m_wasLoadedFromSavedGame:Boolean = false;
      
      public function GameManager(a_parent:GameMenu, a_mapSettings:MapSettings, a_script:XML = null)
      {
         var x:int = 0;
         var team:Team = null;
         var c:Controller = null;
         var structuresAdd:Array = null;
         var unitsAdd:Array = null;
         var tile:Tile = null;
         var unit:Unit = null;
         var e:GameEvent = null;
         var co:LogicalOrCondition = null;
         var surrender:SurrenderAction = null;
         super();
         roundMorale(0.096);
         singleton = this;
         parent = a_parent;
         sprite = new Sprite();
         new TriggerManager();
         new ActionManager();
         new GameEventManager();
         new ResponseManager();
         mapSettings = a_mapSettings;
         var map:Map = mapSettings.getMap();
         tileMap = map.generateTileMap();
         m_isMoraleEnabled = true;
         gameSpriteScroller = new GameSpriteScroller(GAME_WIDTH,GAME_HEIGHT);
         sprite.addChild(gameSpriteScroller);
         var boardMask:Sprite = new Sprite();
         boardMask.graphics.beginFill(0);
         boardMask.graphics.drawRect(0,0,GAME_WIDTH,GAME_HEIGHT);
         sprite.addChild(boardMask);
         gameSpriteScroller.mask = boardMask;
         for(var y:int = 0; y < map.getHeight(); y++)
         {
            for(x = 0; x < map.getWidth(); x++)
            {
               gameSpriteScroller.add(tileMap[y][x].getGameTile(),GameSpriteScroller.TILES);
            }
         }
         gameSpriteScroller.scroll();
         miniMap = new MiniMap(map.generateMiniMap());
         m_statusUI = new StatusUI();
         controllers = new Array();
         m_units = new Array();
         structures = new Array();
         reconPanel = new ReconPanel();
         var teams:Array = mapSettings.getTeams();
         var numHumans:int = 0;
         m_isSoloGame = true;
         for(var i:int = 0; i < teams.length; i++)
         {
            team = teams[i];
            c = team.createController();
            if(team.getControllerType() == "Human")
            {
               reconPanel.addHumanController(c as HumanController);
            }
            if(team.getControllerType().indexOf("Human") == 0)
            {
               numHumans++;
            }
            controllers.push(c);
         }
         if(numHumans > 1)
         {
            m_isSoloGame = false;
         }
         playerPanel = new AllPlayerPanel(teams);
         endTurnButton = new TileSheetButton("endTurnButton");
         endTurnButton.x = BattalionMain.WIDTH - endTurnButton.width - 4;
         endTurnButton.y = BattalionMain.HEIGHT - endTurnButton.height - 14;
         m_idleTimerLabel = new DefaultTextField(0,TextFormatAlign.LEFT,true);
         m_idleTimerLabel.autoSize = TextFieldAutoSize.LEFT;
         m_idleTimerLabel.text = "Time left: 0s";
         m_idleTimerLabel.x = endTurnButton.x - 4;
         m_idleTimerLabel.y = BattalionMain.HEIGHT - m_idleTimerLabel.height + 2;
         m_idleTimerLabel.visible = m_isMoraleEnabled;
         m_leaveGameButton = new TileSheetButton("leaveGameButton");
         m_leaveGameButton.x = endTurnButton.x;
         m_leaveGameButton.y = endTurnButton.y;
         m_leaveGameButton.visible = false;
         nextUnitButton = new TileSheetButton("nextUnitButton");
         nextUnitButton.x = 618;
         nextUnitButton.y = 170;
         m_moveUndoButton = new TileSheetButton("moveUndoButton");
         m_moveUndoButton.x = 580;
         m_moveUndoButton.y = 170;
         m_moveUndoButton.disable();
         if(a_script == null)
         {
            structuresAdd = map.generateStructures(tileMap,controllers);
            for(i = 0; i < structuresAdd.length; i++)
            {
               tile = structuresAdd[i];
               addStructure(tile.getController(),tile);
            }
            unitsAdd = map.generateUnits(controllers);
            for(i = 0; i < unitsAdd.length; i++)
            {
               unit = unitsAdd[i];
               if(localScenario && unit.getBaseUnitData().getName() == "Warmachine")
               {
                  unit.gainResources(3000 - unit.resourcePool);
               }
               unit.setDeployed(true);
               if(unit.getUnitData().hasModifier("Cloaking"))
               {
                  unit.setCloaked(true,false,false);
               }
               addUnit(unit.getController(),unit);
               tileMap[unit.getY()][unit.getX()].setUnit(unit);
               gameSpriteScroller.add(unit.getGameUnit(),GameSpriteScroller.UNITS);
            }
            ScriptManager.parseScript(map.getScript());
            for(i = 0; i < controllers.length; i++)
            {
               e = new GameEvent(GameEvent.REPEAT_FOREVER);
               co = new LogicalOrCondition();
               co.add(new CaptureTerrainCondition("Command Center",i));
               co.add(new NoUnitsCondition(i));
               e.addCondition(co);
               surrender = new SurrenderAction(i);
               surrender.setIsNetworked(false);
               e.addResponse(new SendActionResponse(surrender));
               GameEventManager.getInstance().add(e);
            }
         }
         else
         {
            ScriptManager.parseScript(a_script);
            m_wasLoadedFromSavedGame = true;
         }
         resetBallisticsTable();
         camera = new GameCamera();
         movementCombiner = new MovementCombiner();
         m_loadingPanel = new LoadingPanel();
         parent.stage.addChild(m_loadingPanel);
         m_surrenderedControllers = [];
         for(i = 0; i < controllers.length; i++)
         {
            if(controllers[i] != null)
            {
               controllers[i].initialize();
            }
         }
         m_killerSuggestionEngine = new KillerSuggestionEngine();
      }
      
      public static function getInstance() : GameManager
      {
         if(singleton == null)
         {
            return null;
         }
         return singleton;
      }
      
      public function canAttackTile(a_unit:Unit, a_targetTile:Tile, a_ignoreChecks:Boolean = false, a_attackerX:int = -1, a_attackerY:int = -1, a_unitCanMove:Boolean = false) : Boolean
      {
         var tiles:Array = null;
         if(!a_unit.isAlive())
         {
            return false;
         }
         if(!a_unit.isDeployed())
         {
            return false;
         }
         if(!a_ignoreChecks)
         {
            if(a_unit.hasFired())
            {
               return false;
            }
            if(a_unit.isRanged() && a_unit.hasMoved())
            {
               return false;
            }
         }
         if(a_unitCanMove)
         {
            tiles = tilesInMoveRange(a_unit,a_attackerX,a_attackerY);
         }
         else
         {
            tiles = tilesInRange(a_unit,a_attackerX,a_attackerY);
         }
         if(tiles.indexOf(a_targetTile) >= 0)
         {
            return true;
         }
         return false;
      }
      
      public function getKillerSuggestionEngine() : KillerSuggestionEngine
      {
         return m_killerSuggestionEngine;
      }
      
      public function get goodLoop() : String
      {
         return m_goodLoop;
      }
      
      public function isStillInitializing() : Boolean
      {
         var controller:Controller = null;
         for(var c:int = 0; c < controllers.length; c++)
         {
            controller = controllers[c];
            if(controller.isStillInitializing())
            {
               return true;
            }
         }
         return false;
      }
      
      public function getCamera() : GameCamera
      {
         return camera;
      }
      
      public function getNextUnitButton() : TileSheetButton
      {
         return nextUnitButton;
      }
      
      public function getControllers() : Array
      {
         return controllers;
      }
      
      public function hashCode() : uint
      {
         var u:Unit = null;
         var hash:uint = 0;
         hash += turn;
         hash += round;
         hash += currentController;
         for each(u in m_units)
         {
            hash += u.getX() + u.getY() + u.getHealth() + u.resourcePool;
         }
         return hash;
      }
      
      public function removeUnit(a_unit:Unit) : void
      {
         var unit:Unit = null;
         var isTheLastLinchpinUnit:Boolean = false;
         var t:* = 0;
         a_unit.getController().removeUnit(a_unit);
         if(a_unit.isDeployed())
         {
            tileMap[a_unit.getY()][a_unit.getX()].setUnit(null);
         }
         a_unit.setDeployed(false);
         gameSpriteScroller.remove(a_unit.getGameUnit());
         miniMap.getMap().removeChild(a_unit.getMiniMapSprite());
         for(var i:* = int(m_units.length - 1); i >= 0; i--)
         {
            if(a_unit == m_units[i])
            {
               m_units.splice(i,1);
            }
         }
         var unitsLeft:int = 0;
         var controllersUnits:Array = a_unit.getController().getUnits();
         for(var z:* = int(controllersUnits.length - 1); z >= 0; z--)
         {
            unit = controllersUnits[z];
            if(unit != a_unit && !unit.getUnitData().hasModifier("Fixed"))
            {
               unitsLeft++;
            }
         }
         if(a_unit.getController().getTeam().getActive() && unitsLeft < 1)
         {
            TriggerManager.getInstance().add(new PlayerTrigger(PlayerTrigger.NO_UNITS,getPlayer(a_unit.getController())));
            return;
         }
         if(a_unit.getController().getTeam().getActive() && a_unit.getBaseUnitData().hasModifier("Linchpin"))
         {
            GameManager.getInstance().changeMorale(a_unit.getController(),MoraleChangeAmounts.LINCHPIN_LOST,MoraleChangeAmounts.LINCHPIN_LOST_DESCRIPTION);
            isTheLastLinchpinUnit = true;
            for(t = int(controllersUnits.length - 1); t >= 0; t--)
            {
               unit = controllersUnits[t];
               if(unit != a_unit && unit.getBaseUnitData().hasModifier("Linchpin"))
               {
                  isTheLastLinchpinUnit = false;
               }
            }
            if(isTheLastLinchpinUnit)
            {
               TriggerManager.getInstance().add(new PlayerTrigger(PlayerTrigger.NO_UNITS,getPlayer(a_unit.getController())));
               return;
            }
         }
      }
      
      public function updateUI(a_ms:uint) : void
      {
         var tile:Tile = null;
         playerPanel.setResources(controllers);
         playerPanel.setActive(currentController);
         reconPanel.update();
         var mmx:int = MouseHandler.getInstance().getX();
         var mmy:int = MouseHandler.getInstance().getY();
         var mx:Number = (mmx - sprite.x - gameSpriteScroller.x) / camera.zoom;
         var my:Number = (mmy - sprite.y - gameSpriteScroller.y) / camera.zoom;
         var mtx:int = Math.floor(mx / TileManager.getInstance().getWidth());
         var mty:int = Math.floor(my / TileManager.getInstance().getHeight());
         if(mmx > 0 && mmy > 0 && mmx < GAME_WIDTH && mmy < GAME_HEIGHT)
         {
            if(MouseHandler.getInstance().isDown())
            {
               if(ResponseManager.getInstance().peek() is ChatResponse)
               {
                  if(mmy > 405)
                  {
                     mDown = false;
                     return;
                  }
               }
               if(!mDown)
               {
                  tile = tileAt(mtx,mty);
                  if(tile != null)
                  {
                     if(tile.getUnit() != null)
                     {
                        if(reconPanel.getActive() == tile.getUnit())
                        {
                           reconPanel.setTile(tile,false,true);
                        }
                        else
                        {
                           reconPanel.setTile(tile);
                        }
                     }
                     else
                     {
                        reconPanel.setTile(tile);
                     }
                  }
               }
               mDown = true;
            }
            else
            {
               mDown = false;
            }
         }
      }
      
      public function getMap() : Map
      {
         return mapSettings.getMap();
      }
      
      public function dispose() : void
      {
         SoundSystem.instance.destroyLoop("background");
         for(var i:int = 0; i < controllers.length; i++)
         {
            if(controllers[i] != null)
            {
               controllers[i].dispose();
            }
         }
         controllers = null;
         m_surrenderedControllers = [];
         miniMap = null;
         playerPanel = null;
         mapSettings = null;
         tileMap = null;
         m_units = null;
         structures = null;
         gameSpriteScroller = null;
         ballisticsTable = null;
         parent.removeChild(sprite);
         TweenManager.getInstance().clear();
         singleton = null;
         BattalionMain.getMouseCursor().setCursor("default");
         camera = null;
         ActionManager.getInstance().clear();
         TileSheetSliceManager.getInstance().clearPaletizedSlices();
         TileSheetManager.getInstance().clearPaletized();
      }
      
      public function getNodesInAttackRange(a_x:int, a_y:int, a_unit:Unit) : Array
      {
         var minRange:int = 0;
         var maxRange:int = 0;
         var tile:Tile = tileAt(a_x,a_y);
         if(a_unit.isRanged())
         {
            minRange = a_unit.getBaseUnitData().getWeaponRangeMin();
            maxRange = a_unit.getBaseUnitData().getWeaponRangeMax();
            maxRange = tile.getTerrain().applyModifiers("attackRange",a_unit,maxRange);
            return Astar.range(tileMap[a_y][a_x],minRange,maxRange);
         }
         return Astar.search(tile,null,a_unit,0,true);
      }
      
      public function canAttack(a_unit:Unit, a_targetUnit:Unit, a_ignoreChecks:Boolean = false, a_attackerX:int = -1, a_attackerY:int = -1, a_unitCanMove:Boolean = false) : Boolean
      {
         if(!canWeaponsFireAtTarget(a_unit,a_targetUnit,true,a_attackerX,a_attackerY))
         {
            return false;
         }
         if(a_unit.getController().isAllied(a_targetUnit.getController()))
         {
            return false;
         }
         if(a_targetUnit.isCloaked())
         {
            return false;
         }
         var targetTile:Tile = tileAt(a_targetUnit.getX(),a_targetUnit.getY());
         return canAttackTile(a_unit,targetTile,a_ignoreChecks,a_attackerX,a_attackerY,a_unitCanMove);
      }
      
      public function resolveAttackCycleInResources(a_unit:Unit, a_targetUnit:Unit) : Number
      {
         var damage:Number = NaN;
         var returnUnit:Unit = null;
         var returnFire:Boolean = false;
         var resources:Number = 0;
         if(canWeaponsFireAtTarget(a_unit,a_targetUnit))
         {
            damage = resolveAttack(a_unit,a_targetUnit,null,null,true,false);
            resources += damage / a_targetUnit.getUnitData().getHealth() * a_targetUnit.getUnitData().getCost();
            if(a_targetUnit.getHealth() - damage > 0)
            {
               returnUnit = a_targetUnit.clone();
               returnUnit.takeDamage(damage);
               returnFire = true;
               if(returnUnit.isRanged())
               {
                  if(!returnUnit.getUnitData().hasModifier("Counter Battery"))
                  {
                     returnFire = false;
                  }
               }
               else
               {
                  if(a_unit.isRanged())
                  {
                     returnFire = false;
                  }
                  if(a_targetUnit.getUnitData().hasModifier("Blind Spot"))
                  {
                     returnFire = false;
                  }
               }
               if(returnFire)
               {
                  resources -= resolveAttackInResources(returnUnit,a_unit,false);
               }
            }
         }
         return resources;
      }
      
      public function getCurrentController() : int
      {
         return currentController;
      }
      
      public function moveCost(a_unit:Unit, a_path:Array) : Number
      {
         var check:Tile = null;
         if(!canMove(a_unit,a_path,true))
         {
            return Number.POSITIVE_INFINITY;
         }
         var current:Tile = a_path[0];
         var cost:Number = 0;
         for(var i:int = 1; i < a_path.length; i++)
         {
            check = a_path[i];
            cost += check.getCost(a_unit);
            current = check;
         }
         return cost;
      }
      
      public function nodePath(a_path:Array) : Array
      {
         var retPath:Array = new Array();
         for(var i:int = 0; i < a_path.length; i += 2)
         {
            retPath.push(tileAt(a_path[i],a_path[i + 1]));
         }
         return retPath;
      }
      
      public function setRound(a_round:int) : void
      {
         round = a_round;
      }
      
      public function getMiniMap() : MiniMap
      {
         return miniMap;
      }
      
      public function removeStructure(a_tile:Tile) : void
      {
         if(a_tile.getController() != null)
         {
            a_tile.getController().removeStructure(a_tile);
         }
         a_tile.downgrade();
         for(var i:* = int(structures.length - 1); i >= 0; i--)
         {
            if(a_tile == structures[i])
            {
               structures.splice(i,1);
            }
         }
      }
      
      public function getMovementCombiner() : MovementCombiner
      {
         return movementCombiner;
      }
      
      public function isOneActiveAlliance() : Boolean
      {
         var k:int = 0;
         var actives:Array = new Array();
         for(var i:int = 0; i < controllers.length; i++)
         {
            if(controllers[i].getTeam().getActive())
            {
               actives.push(controllers[i]);
            }
         }
         if(actives.length < 2)
         {
            return true;
         }
         loop1:
         for(var j:int = 0; j < actives.length; )
         {
            k = 0;
            while(true)
            {
               if(k >= actives.length)
               {
                  j++;
                  continue loop1;
               }
               if(actives[j] != null)
               {
                  if(actives[k] != null)
                  {
                     if(j != k)
                     {
                        if(!actives[j].isAllied(actives[k]))
                        {
                           break;
                        }
                     }
                  }
               }
               k++;
            }
            return false;
         }
         return true;
      }
      
      public function changeMorale(a_controller:Controller, a_amount:Number, a_description:String) : void
      {
         var FIRST_THRESHOLD:Number = NaN;
         var SECOND_THRESHOLD:Number = NaN;
         var surrender:SurrenderAction = null;
         if(!m_isMoraleEnabled)
         {
            return;
         }
         if(!BattalionMain.IS_ARENA)
         {
            return;
         }
         var notDemoralizedYet:Boolean = a_controller.morale > 0;
         a_controller.morale += a_amount;
         playerPanel.setMorale(controllers.indexOf(a_controller),a_controller.morale,a_description);
         var iconName:String = "warning";
         if(a_controller is HumanController)
         {
            FIRST_THRESHOLD = 0.3;
            if(a_controller.morale < FIRST_THRESHOLD && a_controller.morale + a_amount >= FIRST_THRESHOLD)
            {
               getStatusUI().addMessage(iconName,"Morale Low","Your troop morale is low. Go on the offense to restore morale.");
            }
            SECOND_THRESHOLD = 0.15;
            if(a_controller.morale < SECOND_THRESHOLD && a_controller.morale + a_amount >= SECOND_THRESHOLD)
            {
               getStatusUI().addMessage(iconName,"Morale Very Low","Your troop morale is dangerously low. Go on the offense to prevent desertion!");
            }
         }
         if(notDemoralizedYet && a_controller.morale <= 0)
         {
            surrender = new SurrenderAction(getPlayer(a_controller));
            surrender.setIsNetworked(false);
            ActionManager.getInstance().add(surrender,true);
         }
      }
      
      public function resolveAttack(a_unit:Unit, a_targetUnit:Unit, a_tile:Tile = null, a_attackTile:Tile = null, a_attack:Boolean = true, a_tiles:Boolean = true) : Number
      {
         if(a_tiles)
         {
            if(a_tile == null)
            {
               a_tile = tileAt(a_targetUnit.getX(),a_targetUnit.getY());
            }
            if(a_attackTile == null)
            {
               a_attackTile = tileAt(a_unit.getX(),a_unit.getY());
            }
         }
         var damage:Number = a_unit.getUnitData().applyModifiers("damage",a_targetUnit,a_unit.getUnitData().getDamage());
         if(a_tiles)
         {
            if(a_attackTile.isStructure())
            {
               damage = a_unit.getUnitData().applyModifiers("structureBonus",a_targetUnit,damage);
            }
         }
         if(a_attack)
         {
            damage = a_unit.getUnitData().applyModifiers("attackBonus",a_targetUnit,damage);
         }
         else
         {
            damage = a_unit.getUnitData().applyModifiers("returnAttackBonus",a_targetUnit,damage);
         }
         var scale:Number = a_unit.getChunks(UNIT_CHUNKS) / UNIT_CHUNKS;
         var damageScale:Number = Number(ballisticsTable[a_unit.getUnitData().getWeaponType()][a_targetUnit.getUnitData().getArmorType()]);
         var defenseScale:Number = 1;
         if(a_tiles)
         {
            defenseScale = a_tile.getTerrain().applyModifiers("defense",a_targetUnit,defenseScale);
            if(a_unit.isRanged())
            {
               defenseScale = a_tile.getTerrain().applyModifiers("rangedDefense",a_targetUnit,defenseScale);
            }
         }
         return damage * damageScale * scale * defenseScale * a_unit.getController().getDifficultyAttackScale();
      }
      
      public function get isMoraleEnabled() : Boolean
      {
         return m_isMoraleEnabled;
      }
      
      public function getStructures() : Array
      {
         return structures;
      }
      
      public function unitsInMoveRange(a_unit:Unit, a_startX:int = -1, a_startY:int = -1) : Array
      {
         var linked:Boolean = false;
         var connections:Array = null;
         var j:int = 0;
         var nodes:Array = tilesInMoveRange(a_unit,a_startX,a_startY);
         if(nodes == null)
         {
            trace("Nodes he can reach are null!");
            return [];
         }
         var units:Array = new Array();
         for(var i:int = 0; i < nodes.length; i++)
         {
            linked = false;
            if(nodes[i].getUnit() != null)
            {
               connections = nodes[i].getConnections();
               for(j = 0; j < connections.length; j++)
               {
                  if(nodes.indexOf(connections[j]) != -1)
                  {
                     if(connections[j].getUnit() == null || connections[j].getUnit() == a_unit)
                     {
                        linked = true;
                        break;
                     }
                  }
               }
               if(linked)
               {
                  if(!nodes[i].getUnit().getController().isAllied(a_unit.getController()))
                  {
                     units.push(nodes[i].getUnit());
                  }
               }
            }
         }
         return units;
      }
      
      public function isMousingOverInfo() : Boolean
      {
         return reconPanel.isMousingOverInfo();
      }
      
      public function controlsStructure(a_controller:Controller, a_tile:Tile) : Boolean
      {
         if(a_tile.getController() == a_controller)
         {
            return true;
         }
         return false;
      }
      
      public function surrenderLocalPlayer() : void
      {
         var controllerId:int = -1;
         for(var i:int = 0; i < controllers.length; i++)
         {
            if(BattalionMain.IS_ARENA)
            {
               if(controllers[i].getName() == BattalionMain.USERNAME)
               {
                  controllerId = i;
                  break;
               }
            }
            else if(controllers[i] is HumanController)
            {
               controllerId = i;
               break;
            }
         }
         var surrender:SurrenderAction = new SurrenderAction(controllerId);
         ActionManager.getInstance().add(surrender,true);
      }
      
      public function getControllerIndex(a_controller:Controller) : int
      {
         for(var i:int = 0; i < controllers.length; i++)
         {
            if(controllers[i] == a_controller)
            {
               return i;
            }
         }
         return -1;
      }
      
      public function getMapSettings() : MapSettings
      {
         return mapSettings;
      }
      
      public function getPlayerPanel() : AllPlayerPanel
      {
         return playerPanel;
      }
      
      public function get evilLoop() : String
      {
         return m_evilLoop;
      }
      
      private function hasControllerSurrendered(a_controller:Controller) : Boolean
      {
         return m_surrenderedControllers.indexOf(a_controller) >= 0;
      }
      
      public function controlsUnit(a_controller:Controller, a_unit:Unit) : Boolean
      {
         if(a_unit.getController() == a_controller)
         {
            return true;
         }
         return false;
      }
      
      public function isAlliedToThePlayer(a_controller:Controller) : Boolean
      {
         if(privateTurns)
         {
            return getActiveController().isAllied(a_controller);
         }
         var h:Controller = null;
         var c:Controller = null;
         for each(c in controllers)
         {
            if(c is HumanController)
            {
               h = c;
               break;
            }
         }
         return h == null || h.isAllied(a_controller);
      }
      
      public function getBallisticsModifier(weaponType:int, armorType:int) : Number
      {
         return ballisticsTable[weaponType][weaponType];
      }
      
      public function getStatusUI() : StatusUI
      {
         return m_statusUI;
      }
      
      public function unitTile(a_unit:Unit) : Tile
      {
         return tileAt(a_unit.getX(),a_unit.getY());
      }
      
      public function tileAt(a_x:int, a_y:int) : Tile
      {
         if(a_x < 0 || a_y < 0 || a_x > mapSettings.getMap().getWidth() - 1 || a_y > mapSettings.getMap().getHeight() - 1)
         {
            return null;
         }
         return tileMap[a_y][a_x];
      }
      
      public function importBallisticsTable(a_xml:XML) : void
      {
         var weaponIndex:int = 0;
         var defenseList:XMLList = null;
         var j:int = 0;
         var armorIndex:int = 0;
         resetBallisticsTable();
         if(a_xml == null)
         {
            return;
         }
         var attackList:XMLList = a_xml..attack;
         for(var i:int = 0; i < attackList.length(); i++)
         {
            weaponIndex = UnitData.weaponTypeFromString(attackList[i].@type);
            defenseList = attackList[i]..defense;
            for(j = 0; j < defenseList.length(); j++)
            {
               armorIndex = UnitData.armorTypeFromString(defenseList[j].@type);
               ballisticsTable[weaponIndex][armorIndex] = Number(defenseList[j].@value);
            }
         }
      }
      
      public function startGame() : void
      {
         m_goodLoop = BattalionMain.getGoodLoop();
         m_evilLoop = BattalionMain.getEvilLoop();
         trace("GameManager: BGM selected. Good:",m_goodLoop,"Evil:",m_evilLoop);
         var game:StartGameAction = new StartGameAction();
         game.setIsNetworked(false);
         ActionManager.getInstance().add(game);
         var round:StartRoundAction = new StartRoundAction();
         round.setIsNetworked(false);
         ActionManager.getInstance().add(round);
         var turn:StartTurnAction = new StartTurnAction();
         turn.setIsNetworked(false);
         ActionManager.getInstance().add(turn);
         if(!BattalionMain.IS_ARENA)
         {
            isMoraleEnabled = false;
         }
      }
      
      public function canWeaponsFireAtTarget(a_unit:Unit, a_targetUnit:Unit, a_strict:Boolean = false, a_attackerX:int = -1, a_attackerY:int = -1, a_targetX:int = -1, a_targetY:int = -1) : Boolean
      {
         var tile:Tile = null;
         if(a_targetX == -1)
         {
            a_targetX = a_targetUnit.getX();
         }
         if(a_targetY == -1)
         {
            a_targetY = a_targetUnit.getY();
         }
         if(a_attackerX == -1)
         {
            a_attackerX = a_unit.getX();
         }
         if(a_attackerY == -1)
         {
            a_attackerY = a_unit.getY();
         }
         if(a_unit.getUnitData().getDamage() <= 0)
         {
            return false;
         }
         if(a_unit.getWeaponRangeMin() <= 0 && a_unit.getWeaponRangeMax() <= 0)
         {
            return false;
         }
         if(a_targetUnit.isCloaked())
         {
            return false;
         }
         if(a_targetUnit.getUnitData().isAir())
         {
            if(a_unit.getUnitData().hasModifier("Skysweeper"))
            {
               return true;
            }
            return false;
         }
         if(a_unit.getUnitData().hasModifier("Air Bound"))
         {
            return false;
         }
         if(!a_targetUnit.getUnitData().isGround() && a_unit.getUnitData().hasModifier("Ground Bound"))
         {
            return false;
         }
         if(!a_targetUnit.getUnitData().isSea() && a_unit.getUnitData().hasModifier("Sea Bound"))
         {
            return false;
         }
         if(a_targetUnit.getUnitData().hasModifier("Submerged") && !a_unit.getUnitData().hasModifier("Anti-Sub"))
         {
            return false;
         }
         if(a_strict)
         {
            if(a_unit.isRanged())
            {
               tile = tileAt(a_attackerX,a_attackerY);
               if(tile.getTerrain().hasModifier("Canopy"))
               {
                  return false;
               }
               tile = tileAt(a_targetX,a_targetY);
               if(a_targetUnit.getUnitData().isGround() && tile.getTerrain().hasModifier("Shielded"))
               {
                  return false;
               }
            }
         }
         return true;
      }
      
      public function tilesInMoveRange(a_unit:Unit, a_startX:int = -1, a_startY:int = -1) : Array
      {
         if(a_startX == -1)
         {
            a_startX = a_unit.getX();
         }
         if(a_startY == -1)
         {
            a_startY = a_unit.getY();
         }
         if(a_unit.isRanged())
         {
            return tilesInRange(a_unit,a_startX,a_startY);
         }
         var tile:Tile = tileAt(a_startX,a_startY);
         return Astar.search(tile,null,a_unit,0,true);
      }
      
      public function resolveAttackInResources(a_unit:Unit, a_targetUnit:Unit, a_attack:Boolean = true) : Number
      {
         var damage:Number = NaN;
         var resources:Number = 0;
         if(canWeaponsFireAtTarget(a_unit,a_targetUnit))
         {
            damage = resolveAttack(a_unit,a_targetUnit,null,null,a_attack,false);
            if(damage > a_targetUnit.getHealth())
            {
               damage = a_targetUnit.getHealth();
            }
            resources = damage / a_targetUnit.getBaseUnitData().getHealth() * a_targetUnit.getBaseUnitData().getCost();
         }
         return resources;
      }
      
      public function endGame() : void
      {
         parent.endGame(true);
      }
      
      public function resetBallisticsTable() : void
      {
         var j:int = 0;
         ballisticsTable = new Array();
         for(var i:int = 0; i < UnitData.weaponTypes.length; i++)
         {
            ballisticsTable[i] = new Array();
            for(j = 0; j < UnitData.armorTypes.length; j++)
            {
               ballisticsTable[i][j] = 0;
            }
         }
      }
      
      public function getController(a_controller:int) : Controller
      {
         if(a_controller >= controllers.length)
         {
            return null;
         }
         return controllers[a_controller];
      }
      
      public function addExplosion(a_type:String, a_gameSprite:GameSprite = null, a_x:int = 0, a_y:int = 0, a_scope:Object = null) : void
      {
         var tileSheet:TileSheet = TileSheetManager.getInstance().get(a_type);
         if(a_scope == null)
         {
            a_scope == tileSheet;
         }
         if(a_gameSprite != null)
         {
            tileSheet.x = a_gameSprite.x + (a_gameSprite.width - tileSheet.width) / 2;
            tileSheet.y = a_gameSprite.y - tileSheet.height + TileManager.getInstance().getHeight();
         }
         else
         {
            tileSheet.x = a_x - tileSheet.width / 2;
            tileSheet.y = a_y - tileSheet.height;
         }
         TweenManager.getInstance().add(new TweenDisplay(tileSheet,true,GameSpriteScroller.TOP,a_scope),TweenManager.SEQUENTIAL);
         TweenManager.getInstance().add(new TweenAnimation(tileSheet,"default",true,a_scope),TweenManager.SEQUENTIAL);
         TweenManager.getInstance().add(new TweenDisplay(tileSheet,false,GameSpriteScroller.TOP,a_scope),TweenManager.SEQUENTIAL);
      }
      
      public function getIdleTimerLabel() : DefaultTextField
      {
         return m_idleTimerLabel;
      }
      
      public function getEndTurnButton() : TileSheetButton
      {
         return endTurnButton;
      }
      
      public function getParent() : GameMenu
      {
         return parent;
      }
      
      public function set isMoraleEnabled(value:Boolean) : void
      {
         m_isMoraleEnabled = value;
         playerPanel.setMoraleVisibility(m_isMoraleEnabled);
         m_idleTimerLabel.visible = m_isMoraleEnabled;
      }
      
      public function healPercentage(a_unit:Unit) : Number
      {
         var healPerc:Number = (a_unit.getUnitData().getHealth() - a_unit.getHealth()) / a_unit.getUnitData().getHealth();
         if(healPerc > 0.25)
         {
            healPerc = 0.25;
         }
         return healPerc;
      }
      
      public function getLeaveGameButton() : TileSheetButton
      {
         return m_leaveGameButton;
      }
      
      public function getGameSpriteScroller() : GameSpriteScroller
      {
         return gameSpriteScroller;
      }
      
      public function unitsInRange(a_unit:Unit, a_x:int = -1, a_y:int = -1, a_forceMinRange:int = -1, a_forceMaxRange:int = -1) : Array
      {
         var nodes:Array = tilesInRange(a_unit,a_x,a_y,a_forceMinRange,a_forceMaxRange);
         var units:Array = [];
         for(var i:int = 0; i < nodes.length; i++)
         {
            if(nodes[i].getUnit() != null)
            {
               if(!nodes[i].getUnit().getController().isAllied(a_unit.getController()))
               {
                  units.push(nodes[i].getUnit());
               }
            }
         }
         return units;
      }
      
      public function toXML() : XML
      {
         var disAll:Boolean = false;
         var en:Dictionary = null;
         var unitName:String = null;
         var unit:Unit = null;
         var tm:Array = null;
         var j:int = 0;
         var tile:Tile = null;
         var capturerx:int = 0;
         var capturery:int = 0;
         var gameState:String = "<gamestate isClassic=\"" + getMap().isClassic() + "\" turn=\"" + turn + "\" round=\"" + round + "\" controller=\"" + currentController + "\"/>";
         for(var i:int = 0; i < controllers.length; i++)
         {
            if(controllers[i] != null)
            {
               gameState += "<resources controller=\"" + i + "\" value=\"" + controllers[i].getResources() + "\"/>";
               disAll = Boolean(controllers[i].getAreAllUnitsDisabled());
               gameState += "<disableAllUnits controller=\"" + i + "\"/>";
               en = controllers[i].getEnabledUnits();
               for(unitName in en)
               {
                  gameState += "<enableUnit controller=\"" + i + "\" unit=\"" + unitName + "\"/>";
               }
            }
         }
         for(i = 0; i < m_units.length; i++)
         {
            unit = m_units[i];
            gameState += "<unit name=\"" + unit.getBaseUnitData().getName() + "\" x=\"" + unit.getX() + "\" y=\"" + unit.getY() + "\" controller=\"" + getPlayer(unit.getController()) + "\">";
            gameState += "<status deployed=\"" + unit.isDeployed() + "\" moved=\"" + unit.hasMoved() + "\" fired=\"" + unit.hasFired() + "\" cloaked=\"" + unit.isCloaked() + "\" repairing=\"" + unit.isRepairing() + "\" />";
            if(unit.isUpgraded())
            {
               gameState += "<upgrade name=\"" + unit.getUnitData().getName() + "\"/>";
            }
            if(unit.getHealth() != unit.getUnitData().getHealth())
            {
               gameState += "<health value=\"" + unit.getHealth() + "\"/>";
            }
            if(unit.resourcePool > 0)
            {
               gameState += "<resourcePool value=\"" + unit.resourcePool + "\"/>";
            }
            tm = unit.getUnitData().getTemporaryModifiers();
            for(j = 0; j < tm.length; j++)
            {
               gameState += "<modifier value=\"" + tm[j].getName() + "\"/>";
            }
            gameState += "</unit>";
         }
         for(i = 0; i < structures.length; i++)
         {
            tile = structures[i];
            capturerx = -1;
            capturery = -1;
            if(tile.getCapturer() != null)
            {
               capturerx = tile.getCapturer().getX();
               capturery = tile.getCapturer().getY();
            }
            gameState += "<structure name=\"" + tile.getTerrain().getName() + "\" x=\"" + tile.getX() + "\" y=\"" + tile.getY() + "\" controller=\"" + getPlayer(tile.getController()) + "\" chunks=\"" + tile.getChunks() + "\" capturerx=\"" + capturerx + "\" capturery=\"" + capturery + "\"/>";
            if(tile.getResources() > 0)
            {
               gameState += "<structureresources x=\"" + tile.getX() + "\" y=\"" + tile.getY() + "\" value=\"" + tile.getResources() + "\"/>";
            }
         }
         return new XML("<game mapurl=\"" + mapSettings.getMap().getMapURL() + "\" mapname=\"" + mapSettings.getMap().getMapName() + "\">" + mapSettings.toXML() + "<script>" + GameEventManager.getInstance().toXML() + gameState + "</script> </game>");
      }
      
      public function getTileMap() : Array
      {
         return tileMap;
      }
      
      public function addControllerToSurrenderedList(a_controller:Controller) : void
      {
         var controllerIdx:int = controllers.indexOf(a_controller);
         if(controllerIdx < 0)
         {
            throw new Error("GameManager: Error adding controller to surrendered list. Controller is not in the GameManager.");
         }
         var surrenderIdx:int = m_surrenderedControllers.indexOf(a_controller);
         if(surrenderIdx >= 0)
         {
            throw new Error("GameManager: Error adding controller to surrendered list. Controller is already in the list at index: " + surrenderIdx);
         }
         m_surrenderedControllers.push(a_controller);
      }
      
      public function setCurrentController(a_currentController:int) : void
      {
         currentController = a_currentController;
         if(privateTurns && getActiveController() != null)
         {
            var unit:Unit;
            for each(unit in m_units)
            {
               if(unit.isCloaked())
               {
                  unit.setCloaked(false,true);
               }
            }
            unit = reconPanel.getActive() as Unit;
            if(unit != null && unit.isCloaked() && !isAlliedToThePlayer(unit.getController()))
            {
               reconPanel.setLock(false);
               reconPanel.setTile(unitTile(unit),false,true);
            }
         }
      }

      public function payFactoryIncome(a_controller:Controller) : void
      {
         if(!localScenario)
         {
            return;
         }
         var amount:int = 0;
         for each(var tile:Tile in a_controller.getStructures())
         {
            if(tile.getTerrain().getName() == "Factory")
            {
               amount += 150;
            }
         }
         if(amount == 0)
         {
            return;
         }
         for each(var unit:Unit in a_controller.getUnits())
         {
            if(unit.isAlive() && unit.getBaseUnitData().getName() == "Warmachine")
            {
               unit.gainResources(amount);
            }
         }
      }
      
      public function getActiveController() : Controller
      {
         return controllers[currentController];
      }
      
      public function getSprite() : Sprite
      {
         return sprite;
      }
      
      public function roundMorale(a_amount:Number) : int
      {
         return int(Math.round(a_amount * 100));
      }
      
      public function canMove(a_unit:Unit, a_path:Array, ignoreEnd:Boolean = false) : Boolean
      {
         var current:Tile = null;
         var cost:Number = NaN;
         var check:Tile = null;
         var i:int = 0;
         if(!a_unit.isAlive())
         {
            return false;
         }
         if(!a_unit.isDeployed())
         {
            return false;
         }
         if(a_unit.hasMoved())
         {
            return false;
         }
         if(a_path.length < 1)
         {
            return false;
         }
         if(a_path[0] == null)
         {
            return false;
         }
         if(!ignoreEnd)
         {
            if(a_path[a_path.length - 1].getUnit() != null)
            {
               if(a_path[a_path.length - 1].getUnit() != a_unit && !a_path[a_path.length - 1].getUnit().isCloaked())
               {
                  return false;
               }
            }
         }
         if(a_path[0].getUnit() == a_unit)
         {
            current = a_path[0];
            cost = 0;
            for(i = 1; i < a_path.length; i++)
            {
               check = a_path[i];
               if(check == null)
               {
                  return false;
               }
               if(!current.isConnected(check))
               {
                  return false;
               }
               cost += check.getCost(a_unit);
               current = check;
            }
            if(cost > a_unit.getRange())
            {
               return false;
            }
            return true;
         }
         return false;
      }
      
      public function get isSoloGame() : Boolean
      {
         return m_isSoloGame;
      }
      
      public function getUnits() : Array
      {
         return m_units;
      }
      
      public function update(a_ms:uint = 0) : void
      {
         var controller:HumanController = null;
         var newController:HALController = null;
         var structures:Array = null;
         var s:int = 0;
         var units:Array = null;
         var u:int = 0;
         var structure:Tile = null;
         var unit:Unit = null;
         if(m_loadingPanel != null)
         {
            if(!isStillInitializing())
            {
               m_loadingPanel.stop();
               m_loadingPanel = null;
               if(!m_wasLoadedFromSavedGame)
               {
                  startGame();
               }
               else
               {
                  ActionManager.getInstance().add(new SendTriggerAction(new PlayerTrigger(PlayerTrigger.START_TURN,GameManager.getInstance().getCurrentController())));
               }
            }
            return;
         }
         TriggerManager.getInstance().add(new TimePassedTrigger(a_ms));
         TriggerManager.getInstance().update();
         GameEventManager.getInstance().update();
         ResponseManager.getInstance().update();
         ActionManager.getInstance().update();
         camera.update(a_ms);
         for(var i:int = 0; i < controllers.length; i++)
         {
            if(controllers[i].getTeam().getActive())
            {
               controllers[i].update(a_ms);
               if(currentController == i)
               {
                  controllers[i].getTeam().addStatistic(Team.TIME_TAKEN,a_ms);
               }
            }
         }
         if(!TweenManager.getInstance().isEmpty())
         {
            gameSpriteScroller.scroll(true);
         }
         gameSpriteScroller.update(a_ms);
         updateUI(a_ms);
         if(BattalionMain.ALLOW_DEBUG)
         {
            if(KeyboardHandler.getInstance().isDown(Keyboard.HOME))
            {
               for(i = 0; i < controllers.length; i++)
               {
                  if(controllers[i].getTeam().getControllerType() != "Human")
                  {
                     ActionManager.getInstance().add(new SurrenderAction(i));
                  }
               }
            }
            if(KeyboardHandler.getInstance().isDown(Keyboard.END) && !KeyboardHandler.getInstance().isDown(Keyboard.SHIFT))
            {
               for(i = 0; i < controllers.length; i++)
               {
                  if(controllers[i].getTeam().getControllerType() == "Human")
                  {
                     ActionManager.getInstance().add(new SurrenderAction(i));
                  }
               }
            }
            if(KeyboardHandler.getInstance().isDown(Keyboard.END) && KeyboardHandler.getInstance().isDown(Keyboard.SHIFT))
            {
               for(i = 0; i < controllers.length; i++)
               {
                  if(controllers[i].getTeam().getControllerType() == "Human")
                  {
                     controller = controllers[i];
                     newController = new HALController(controller.getTeam());
                     newController.addResources(controller.getResources());
                     structures = controller.getStructures();
                     for(s = 0; s < structures.length; s++)
                     {
                        structure = structures[s];
                        structure.setController(null);
                        structure.setController(newController);
                        newController.addStructure(structure);
                     }
                     units = controller.getUnits();
                     for(u = 0; u < units.length; u++)
                     {
                        unit = units[u];
                        unit.setController(null);
                        unit.setController(newController);
                        newController.addUnit(unit);
                     }
                     controllers.splice(i,1);
                     controllers.splice(i,0,newController);
                     if(getActiveController() == newController)
                     {
                        controller.endTurn(EndTurnAction.REASON_DEBUG_ENDGAME);
                     }
                  }
               }
            }
         }
      }
      
      public function isPlayerWinner() : Boolean
      {
         var c:Controller = null;
         var win:Boolean = false;
         var playerController:HumanController = null;
         for each(c in controllers)
         {
            if(c is HumanController)
            {
               playerController = c as HumanController;
            }
         }
         if(playerController == null)
         {
            return false;
         }
         var alivePlayers:Array = [];
         for each(c in controllers)
         {
            if(m_surrenderedControllers.indexOf(c) < 0)
            {
               alivePlayers.push(c);
               trace("Alive player:",getControllerIndex(c));
            }
         }
         win = false;
         if(alivePlayers.indexOf(playerController) >= 0)
         {
            win = true;
            trace("Player is alive at the end of the game");
         }
         else
         {
            for each(c in alivePlayers)
            {
               if(c.getTeam().isAllied(controllers.indexOf(playerController)))
               {
                  win = true;
                  trace("Alive ally of human controller:",getControllerIndex(c));
               }
            }
         }
         return win;
      }
      
      public function getReconPanel() : ReconPanel
      {
         return reconPanel;
      }
      
      public function addUnit(a_controller:Controller, a_unit:Unit) : void
      {
         a_controller.addUnit(a_unit);
         m_units.push(a_unit);
         miniMap.getMap().addChild(a_unit.getMiniMapSprite());
      }
      
      public function addStructure(a_controller:Controller, a_tile:Tile) : void
      {
         if(a_controller != null)
         {
            a_controller.addStructure(a_tile);
         }
         structures.push(a_tile);
      }
      
      public function activePlayers() : int
      {
         var active:int = 0;
         for(var i:int = 0; i < controllers.length; i++)
         {
            if(controllers[i].getTeam().getActive())
            {
               active++;
            }
         }
         return active;
      }
      
      public function getPlayer(a_controller:Controller) : int
      {
         for(var i:int = 0; i < controllers.length; i++)
         {
            if(controllers[i] == a_controller)
            {
               return i;
            }
         }
         return -1;
      }
      
      public function getRound() : int
      {
         return round;
      }
      
      public function tilesInRange(a_unit:Unit, a_x:int = -1, a_y:int = -1, a_forceMinRange:int = -1, a_forceMaxRange:int = -1) : Array
      {
         var minRange:int = 0;
         var maxRange:int = 0;
         var tile:Tile = null;
         if(a_x == -1)
         {
            a_x = a_unit.getX();
         }
         if(a_y == -1)
         {
            a_y = a_unit.getY();
         }
         var units:Array = new Array();
         if(a_forceMinRange != -1 && a_forceMaxRange != -1)
         {
            minRange = a_forceMinRange;
            maxRange = a_forceMaxRange;
         }
         else
         {
            minRange = a_unit.getUnitData().getWeaponRangeMin();
            maxRange = a_unit.getUnitData().getWeaponRangeMax();
            if(a_unit.isRanged())
            {
               tile = tileAt(a_unit.getX(),a_unit.getY());
               maxRange = tile.getTerrain().applyModifiers("attackRange",a_unit,maxRange);
            }
         }
         return Astar.range(tileMap[a_y][a_x],minRange,maxRange);
      }
      
      public function pointPath(a_path:Array) : Array
      {
         if(a_path == null)
         {
            return null;
         }
         var retPath:Array = new Array();
         for(var i:int = 0; i < a_path.length; i++)
         {
            retPath.push(a_path[i].getX());
            retPath.push(a_path[i].getY());
         }
         return retPath;
      }
      
      public function getMoveUndoButton() : TileSheetButton
      {
         return m_moveUndoButton;
      }
      
      public function unitAt(a_x:int, a_y:int) : Unit
      {
         var t:Tile = tileAt(a_x,a_y);
         if(t == null)
         {
            return null;
         }
         return t.getUnit();
      }
      
      public function surrender(a_player:int) : void
      {
         var endGame:EndGameAction = null;
         var controller:Controller = controllers[a_player];
         controller.getTeam().setActive(false);
         controller.deactivate();
         if(isOneActiveAlliance())
         {
            trace("one active alliance!");
            endGame = new EndGameAction();
            endGame.setIsNetworked(false);
            ActionManager.getInstance().add(endGame,true);
         }
      }
      
      public function getTurn() : int
      {
         return turn;
      }
      
      public function exposeStealthUnitsAround(a_unit:Unit) : void
      {
         var t:Tile = null;
         var u:Unit = null;
         var range:int = 1;
         if(a_unit.getUnitData().hasModifier("Jamming"))
         {
            range = 2;
         }
         var tiles:Array = Astar.range(a_unit.getTile(),0,range);
         for each(t in tiles)
         {
            u = t.getUnit();
            if(u != null)
            {
               if(!u.getController().isAllied(a_unit.getController()))
               {
                  u.setCloaked(false);
               }
            }
         }
      }
      
      public function setTurn(a_turn:int) : void
      {
         turn = a_turn;
      }
   }
}


