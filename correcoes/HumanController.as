package com.gamedozer.battalion.game.controllers
{
   import com.gamedozer.battalion.*;
   import com.gamedozer.battalion.assets.*;
   import com.gamedozer.battalion.audio.*;
   import com.gamedozer.battalion.data.*;
   import com.gamedozer.battalion.display.*;
   import com.gamedozer.battalion.game.*;
   import com.gamedozer.battalion.game.actions.*;
   import com.gamedozer.battalion.ui.*;
   import com.gamedozer.battalion.utils.*;
   import com.urbansquall.utils.*;
   import flash.display.Bitmap;
   import flash.display.DisplayObject;
   import flash.display.Sprite;
   import flash.events.*;
   import flash.text.*;
   import flash.ui.*;
   import flash.utils.*;
   
   public class HumanController extends Controller
   {
      
      public static const BAD_TARGET:Number = -25;
      
      public static const OK_TARGET:Number = 70;
      
      internal var buttons:Array;
      
      internal var m_resourcePoolLabel:GameSprite;
      
      internal var m_jammedOverlay:GameSprite;
      
      internal var currentPathSprites:Array;
      
      internal var wmBuildMenu:WMBuildMenu;
      
      internal var currentPath:Array;
      
      internal var m_undoAction:UndoMoveAction;
      
      internal var uiButtons:Array;
      
      internal var lastSelected:Unit;
      
      internal var control:Boolean;
      
      internal var camerax:int;
      
      internal var cameray:int;
      
      internal var buildMenu:BuildMenu;
      
      public function HumanController(a_team:Team)
      {
         super(a_team);
         buttons = new Array();
         control = false;
         uiButtons = new Array();
         currentPath = new Array();
         currentPathSprites = new Array();
         TriggerManager.getInstance().addListener(Trigger.CONTROL,controlListener);
         control = false;
         camerax = cameray = -1;
      }
      
      override public function deactivate() : void
      {
         GameManager.getInstance().getEndTurnButton().visible = false;
         var b:TileSheetButton = GameManager.getInstance().getEndTurnButton();
         b.disable();
         var n:TileSheetButton = GameManager.getInstance().getNextUnitButton();
         n.disable();
         var u:TileSheetButton = GameManager.getInstance().getMoveUndoButton();
         u.disable();
         GameManager.getInstance().getParent().mainMenuButton.disable();
         var leaveGameButton:TileSheetButton = GameManager.getInstance().getLeaveGameButton();
         leaveGameButton.addEventListener(MouseEvent.CLICK,leaveGameHandler);
         leaveGameButton.enable();
         leaveGameButton.visible = true;
      }
      
      protected function selectMove(a_position:MovePosition) : void
      {
         var tileToAttackFrom:Tile = null;
         var moveAction:MoveUnitAction = null;
         if(currentPath == null || currentPath.length == 0)
         {
            if(!(a_position.attack && a_position.unit.isRanged()))
            {
               return;
            }
            currentPath = [];
            currentPath[0] = a_position.unit.getX();
            currentPath[1] = a_position.unit.getY();
         }
         if(!a_position.attack && currentPath[currentPath.length - 2] == a_position.unit.getX() && currentPath[currentPath.length - 1] == a_position.unit.getY())
         {
            showUnitMenu(null,a_position.unit);
         }
         else
         {
            tileToAttackFrom = GameManager.getInstance().tileAt(currentPath[currentPath.length - 2],currentPath[currentPath.length - 1]);
            if(tileToAttackFrom.getUnit() != null && tileToAttackFrom.getUnit() != a_position.unit && !(tileToAttackFrom.getUnit().isCloaked() && !tileToAttackFrom.getUnit().getController().isAllied(a_position.unit.getController())))
            {
               trace("Corrupt attack action");
               receiveControl();
               return;
            }
            GameManager.getInstance().getCamera().setEnabled(false);
            chooseMove(a_position);
            clearButtons();
            m_undoAction = null;
            moveAction = new MoveUnitAction(a_position.unit.getX(),a_position.unit.getY(),MoveUnitAction.stringizePath(currentPath));
            ActionManager.getInstance().add(moveAction);
            if(a_position.attack)
            {
               ActionManager.getInstance().add(new AttackUnitAction(currentPath[currentPath.length - 2],currentPath[currentPath.length - 1],a_position.x,a_position.y));
            }
            else
            {
               m_undoAction = moveAction.createUndoAction(a_position.unit.isCloaked());
               ActionManager.getInstance().add(new NoAttackAction(currentPath[currentPath.length - 2],currentPath[currentPath.length - 1]));
            }
            clearUIButtons();
         }
         clearPath();
      }
      
      override public function setEnabled(a_enabled:Boolean) : void
      {
         super.setEnabled(a_enabled);
         if(enabled)
         {
            GameManager.getInstance().getCamera().setEnabled(true);
         }
         else
         {
            GameManager.getInstance().getCamera().setEnabled(false);
            clearUIButtons();
            clearButtons();
            clearPath();
         }
      }
      
      private function addCanAttackMyUnitIndicator(a_unit:Unit, a_resourceDamage:int) : void
      {
         var targetGraphic:TileSheet = null;
         var frame:int = 0;
         if(a_resourceDamage < BAD_TARGET)
         {
            frame = 0;
         }
         else if(a_resourceDamage < OK_TARGET)
         {
            frame = 1;
         }
         else
         {
            frame = 2;
         }
         var node:Tile = GameManager.getInstance().tileAt(a_unit.getX(),a_unit.getY());
         targetGraphic = TileSheetManager.getInstance().get("dangerIndicator");
         targetGraphic.noAnimation = true;
         targetGraphic.setFrame(frame);
         targetGraphic.mouseEnabled = false;
         targetGraphic.mouseChildren = false;
         var targetOffset:int = 0;
         targetGraphic.x = node.getGameTile().x + targetOffset;
         targetGraphic.y = node.getGameTile().y + targetOffset;
         if(targetGraphic.x < 0)
         {
            targetGraphic.x = targetGraphic.width - targetOffset;
            targetGraphic.scaleX = -1;
         }
         if(targetGraphic.y < 0)
         {
            targetGraphic.y = 0;
         }
         GameManager.getInstance().getGameSpriteScroller().add(targetGraphic,GameSpriteScroller.ABOVE_ALL);
         currentPathSprites.push(targetGraphic);
      }
      
      protected function drawPath(a_unit:Unit) : void
      {
         var x:int = 0;
         var y:int = 0;
         var name:String = null;
         var angle:int = 0;
         var vehicle:Boolean = false;
         var b:BitmapSprite = null;
         var d:GameSprite = null;
         var node:Tile = null;
         var unit:Boolean = false;
         var cloaked:Boolean = false;
         var t:TileSheet = null;
         var newTile:Tile = null;
         if(currentPath == null)
         {
            return;
         }
         addAllCanAttackMyUnitIndicators(a_unit,currentPath[currentPath.length - 2],currentPath[currentPath.length - 1]);
         var unitTile:Tile = GameManager.getInstance().tileAt(a_unit.getX(),a_unit.getY());
         var dir:int = 0;
         for(var i:int = 0; i < currentPath.length; i += 2)
         {
            x = int(currentPath[i]);
            y = int(currentPath[i + 1]);
            name = "";
            angle = 0;
            vehicle = false;
            if(i == 0)
            {
               if(currentPath.length < 3)
               {
                  name = "nomove";
                  if(!(a_unit.getUnitData().hasModifier("Cloaking") || a_unit.getUnitData().isAir()))
                  {
                     if(a_unit.getUnitData().hasModifier("Jamming"))
                     {
                        drawJammedTiles(Astar.range(unitTile,0,2));
                     }
                     else if(a_unit.isRanged())
                     {
                        drawJammedTiles(Astar.range(unitTile,a_unit.getUnitData().getWeaponRangeMin(),unitTile.getTerrain().applyModifiers("attackRange",a_unit,a_unit.getUnitData().getWeaponRangeMax())),false);
                     }
                  }
               }
               else
               {
                  name = "start";
                  angle = direction(x,y,currentPath[i + 2],currentPath[i + 3]);
                  dir = angle;
               }
            }
            else if(i == currentPath.length - 2)
            {
               node = GameManager.getInstance().tileAt(currentPath[i],currentPath[i + 1]);
               unit = false;
               cloaked = false;
               if(node.getUnit() != null)
               {
                  unit = true;
                  if(node.getUnit().isCloaked())
                  {
                     unit = true;
                     cloaked = true;
                     if(node.getUnit().getController() != a_unit.getController())
                     {
                        cloaked = false;
                        unit = false;
                     }
                  }
               }
               if(unit || cloaked)
               {
                  name = "unmoveable";
               }
               else
               {
                  name = "end";
                  vehicle = true;
               }
               angle = dir;
            }
            else if(dir == direction(x,y,currentPath[i + 2],currentPath[i + 3]))
            {
               name = "straight";
               angle = dir;
            }
            else
            {
               name = "turn";
               angle = dir;
               dir = direction(x,y,currentPath[i + 2],currentPath[i + 3]);
               if(dir != (angle + 90) % 360)
               {
                  angle += 90;
               }
            }
            b = new BitmapSprite(BitmapLibrary.loadBitmap("movement_" + name));
            b.x = -TileManager.getInstance().getWidth() / 2;
            b.y = -TileManager.getInstance().getHeight() / 2;
            d = new GameSprite();
            d.addChild(b);
            d.x = x * TileManager.getInstance().getWidth() + TileManager.getInstance().getWidth() / 2;
            d.y = y * TileManager.getInstance().getHeight() + TileManager.getInstance().getHeight() / 2;
            d.rotation = angle;
            if(name == "start")
            {
               GameManager.getInstance().getGameSpriteScroller().add(d,GameSpriteScroller.BELOW_UNITS);
            }
            else
            {
               GameManager.getInstance().getGameSpriteScroller().add(d,GameSpriteScroller.BELOW_UNITS);
            }
            d.mouseChildren = false;
            d.mouseEnabled = false;
            if(vehicle)
            {
               t = TileSheetManager.getInstance().getPalettized(a_unit.getUnitData().getSprite(),PaletteEntry.findPalette(a_unit.getController().getTeam().getColor()));
               t.alpha = 0.5;
               if(angle == 0)
               {
                  t.playAnimation("right_idle");
               }
               else if(angle == 90)
               {
                  t.playAnimation("down_idle");
               }
               else if(angle == 180)
               {
                  t.playAnimation("left_idle");
               }
               else
               {
                  t.playAnimation("up_idle");
               }
               t.x = x * TileManager.getInstance().getWidth();
               t.y = y * TileManager.getInstance().getHeight();
               if(t.height > TileManager.getInstance().getHeight())
               {
                  t.y -= t.height - TileManager.getInstance().getHeight();
               }
               t.mouseChildren = false;
               t.mouseEnabled = false;
               GameManager.getInstance().getGameSpriteScroller().add(t,GameSpriteScroller.BELOW_UNITS);
               currentPathSprites.push(t);
               newTile = GameManager.getInstance().tileAt(x,y);
               if(!(a_unit.getUnitData().hasModifier("Cloaking") || a_unit.getUnitData().isAir()))
               {
                  if(a_unit.getUnitData().hasModifier("Jamming"))
                  {
                     drawJammedTiles(Astar.range(newTile,0,2));
                  }
                  else if(a_unit.isRanged())
                  {
                     drawJammedTiles(Astar.range(newTile,a_unit.getUnitData().getWeaponRangeMin(),newTile.getTerrain().applyModifiers("attackRange",a_unit,a_unit.getUnitData().getWeaponRangeMax())),false);
                  }
               }
            }
            currentPathSprites.push(d);
         }
      }
      
      protected function direction(x1:int, y1:int, x2:int, y2:int) : int
      {
         if(y1 == y2)
         {
            if(x1 < x2)
            {
               return 0;
            }
            return 180;
         }
         if(y1 < y2)
         {
            return 90;
         }
         return 270;
      }
      
      protected function chooseMove(a_position:MovePosition) : void
      {
         var currentEndTile:Tile = null;
         var unito:Boolean = false;
         var nodes:Array = null;
         var i:int = 0;
         var path:Array = null;
         var unit:Unit = a_position.unit;
         var gameManager:GameManager = GameManager.getInstance();
         var tile:Tile = gameManager.tileAt(unit.getX(),unit.getY());
         var endTile:Tile = gameManager.tileAt(a_position.x,a_position.y);
         if(a_position.attack)
         {
            if(unit.isRanged())
            {
               chooseMove(new MovePosition(unit.getX(),unit.getY(),unit));
               return;
            }
            if(currentPath == null || currentPath.length == 0)
            {
               return;
            }
            currentEndTile = gameManager.tileAt(currentPath[currentPath.length - 2],currentPath[currentPath.length - 1]);
            unito = false;
            if(currentEndTile.getUnit() != null)
            {
               if(!currentEndTile.getUnit().isCloaked())
               {
                  unito = true;
               }
            }
            if(!currentEndTile.isConnected(endTile) || unito)
            {
               nodes = Astar.search(tile,null,unit);
               for(i = 0; i < nodes.length; i++)
               {
                  if(Boolean(nodes[i].isConnected(endTile)) && (nodes[i].getUnit() == null || nodes[i].getUnit() == unit))
                  {
                     chooseMove(new MovePosition(nodes[i].getX(),nodes[i].getY(),unit));
                     return;
                  }
               }
            }
            return;
         }
         var newPath:Boolean = false;
         if(currentPath == null || currentPath.length == 0)
         {
            newPath = true;
         }
         else
         {
            currentEndTile = gameManager.tileAt(currentPath[currentPath.length - 2],currentPath[currentPath.length - 1]);
            if(currentEndTile == endTile)
            {
               return;
            }
            if(!currentEndTile.isConnected(endTile))
            {
               newPath = true;
            }
            for(i = 0; i < currentPath.length; i += 2)
            {
               if(currentPath[i] == a_position.x && currentPath[i + 1] == a_position.y)
               {
                  currentPath.splice(i,currentPath.length - i);
                  break;
               }
            }
            currentPath.push(a_position.x);
            currentPath.push(a_position.y);
            if(gameManager.moveCost(unit,gameManager.nodePath(currentPath)) > unit.getRange())
            {
               newPath = true;
            }
         }
         if(newPath)
         {
            clearPath();
            path = Astar.pathTrim(tile,endTile,unit);
            currentPath = gameManager.pointPath(path);
         }
         else
         {
            clearPath(true);
         }
         drawPath(unit);
      }
      
      private function updateUndoMoveButton() : void
      {
         var undoMoveButton:TileSheetButton = GameManager.getInstance().getMoveUndoButton();
         if(m_undoAction == null || GameManager.getInstance().isMoraleEnabled && morale + MoraleChangeAmounts.UNDO_MOVE <= 0)
         {
            undoMoveButton.disable();
         }
         else
         {
            undoMoveButton.enable();
         }
      }
      
      public function clearPath(a_spritesOnly:Boolean = false) : void
      {
         var scroller:GameSpriteScroller = GameManager.getInstance().getGameSpriteScroller();
         for(var i:int = 0; i < currentPathSprites.length; i++)
         {
            scroller.remove(currentPathSprites[i]);
         }
         currentPathSprites = new Array();
         if(!a_spritesOnly)
         {
            currentPath = new Array();
         }
      }
      
      protected function selectEnemyUnit(a_unit:Unit) : void
      {
         var ignoreMe:Array;
         var tile:Tile;
         var gameManager:GameManager;
         var nodes:Array = null;
         var b:GameButton = null;
         var ranges:Array = null;
         var jammerTiles:Array = null;
         var i:int = 0;
         var index:int = 0;
         var r:Number = NaN;
         clearButtons();
         clearUIButtons();
         clearPath();
         gameManager = GameManager.getInstance();
         tile = gameManager.tileAt(a_unit.getX(),a_unit.getY());
         if(a_unit.getUnitData().hasModifier("Jamming"))
         {
            jammerTiles = Astar.range(tile,0,2);
            drawJammedTiles(jammerTiles);
         }
         if(a_unit.isRanged())
         {
            nodes = Astar.search(tile,null,a_unit);
            if(nodes == null)
            {
               nodes = new Array(tile);
            }
            ranges = Astar.range(tile,a_unit.getUnitData().getWeaponRangeMin(),tile.getTerrain().applyModifiers("attackRange",a_unit,a_unit.getUnitData().getWeaponRangeMax()));
            for(i = nodes.length - 1; i >= 0; i--)
            {
               index = ranges.indexOf(nodes[i]);
               if(index != -1)
               {
                  b = new GameButton(new BitmapSprite(AssetLibrary.createBitmapData("selectMixed")));
                  ranges.splice(index,1);
               }
               else
               {
                  b = new GameButton(new BitmapSprite(AssetLibrary.createBitmapData("select")));
               }
               b.x = nodes[i].getGameTile().x;
               b.y = nodes[i].getGameTile().y;
               if(nodes[i].getUnit() == a_unit)
               {
                  b.release = function():void
                  {
                     receiveControl();
                  };
               }
               gameManager.getGameSpriteScroller().add(b,GameSpriteScroller.BUTTONS);
               buttons.push(b);
            }
            for(i = ranges.length - 1; i >= 0; i--)
            {
               b = new GameButton(new BitmapSprite(AssetLibrary.createBitmapData("selectOrange")));
               b.x = ranges[i].getGameTile().x;
               b.y = ranges[i].getGameTile().y;
               gameManager.getGameSpriteScroller().add(b,GameSpriteScroller.BUTTONS);
               buttons.push(b);
            }
         }
         else
         {
            nodes = Astar.search(tile,null,a_unit,0,true);
            if(nodes == null)
            {
               nodes = new Array(tile);
            }
            r = a_unit.getRange();
            for(i = nodes.length - 1; i >= 0; i--)
            {
               if(!(a_unit.getWeaponRangeMax() <= 0 && nodes[i].g > r))
               {
                  if(nodes[i].g > r)
                  {
                     b = new GameButton(new BitmapSprite(AssetLibrary.createBitmapData("selectOrange")));
                  }
                  else
                  {
                     b = new GameButton(new BitmapSprite(AssetLibrary.createBitmapData("select")));
                  }
                  b.x = nodes[i].getGameTile().x;
                  b.y = nodes[i].getGameTile().y;
                  if(nodes[i].getUnit() == a_unit)
                  {
                     b.release = function():void
                     {
                        receiveControl();
                     };
                     gameManager.getGameSpriteScroller().add(b,GameSpriteScroller.BUTTONS);
                  }
                  else
                  {
                     gameManager.getGameSpriteScroller().add(b,GameSpriteScroller.TOP);
                  }
                  buttons.push(b);
               }
            }
         }
         b = new GameButton(new BitmapSprite(AssetLibrary.createBitmapData("marker2")));
         b.x = a_unit.getGameUnit().x;
         b.y = a_unit.getGameUnit().y;
         GameManager.getInstance().getGameSpriteScroller().add(b,GameSpriteScroller.BUTTONS);
         buttons.push(b);
         createClearButton();
         ignoreMe = new Array();
         ignoreMe.push(a_unit);
         selectUnits(null,ignoreMe);
         selectBuildings();
      }
      
      public function buildUnitsFromWM(a_unit:UnitData, a_fromTile:Tile, a_toTile:Tile) : void
      {
         ActionManager.getInstance().add(new WMBuildUnitAction(GameManager.getInstance().getCurrentController(),a_toTile.getX(),a_toTile.getY(),a_unit.getName(),a_fromTile.getX(),a_fromTile.getY()));
         clearUIButtons();
      }
      
      override public function dispose() : void
      {
         super.dispose();
         BattalionMain.getStage().removeEventListener(KeyboardEvent.KEY_DOWN,keyDownHandler);
         clearPath();
         clearButtons();
         clearUIButtons();
         uiButtons = null;
         buttons = null;
         currentPath = null;
         currentPathSprites = null;
      }
      
      protected function clearUIButtons() : void
      {
         if(m_jammedOverlay != null)
         {
            m_jammedOverlay.parent.removeChild(m_jammedOverlay);
            m_jammedOverlay = null;
         }
         if(buildMenu != null)
         {
            GameManager.getInstance().getParent().removeChild(buildMenu);
            buildMenu = null;
         }
         if(wmBuildMenu != null)
         {
            wmBuildMenu.cleanupNoControllerCall();
            wmBuildMenu = null;
         }
         updateUndoMoveButton();
      }
      
      public function buildUnits(a_unit:UnitData, a_tile:Tile) : void
      {
         ActionManager.getInstance().add(new BuildUnitAction(a_tile.getX(),a_tile.getY(),a_unit.getName()));
         clearUIButtons();
      }
      
      protected function selectBuildings(a_ignore:Array = null) : void
      {
         var i:int;
         var b:GameButton = null;
         if(a_ignore == null)
         {
            a_ignore = new Array();
         }
         for(i = 0; i < structures.length; i++)
         {
            if(a_ignore.indexOf(structures[i]) == -1)
            {
               if(structures[i].getUnit() == null)
               {
                  if(structures[i].getTerrain().hasModifier("Construction"))
                  {
                     b = new GameButton(new BitmapSprite(AssetLibrary.createBitmapData("marker")),"select");
                     b.value = structures[i];
                     b.release = function():void
                     {
                        selectBuilding(this.value);
                     };
                     b.x = structures[i].getGameTile().x;
                     b.y = structures[i].getGameTile().y;
                     GameManager.getInstance().getGameSpriteScroller().add(b,GameSpriteScroller.BUTTONS);
                     buttons.push(b);
                  }
               }
            }
         }
      }
      
      internal function extractResources(a_unit:Unit) : void
      {
         ActionManager.getInstance().add(new ExtractResourcesAction(a_unit.getX(),a_unit.getY()));
         clearUI();
      }
      
      protected function updateUnitCloaking() : void
      {
         var u:Unit = null;
         for each(u in GameManager.getInstance().getUnits())
         {
            if(u.isCloaked())
            {
               u.setCloaked(false,true);
            }
         }
      }
      
      override public function setCamera() : void
      {
         if(camerax != -1)
         {
            GameManager.getInstance().getCamera().setLocation(camerax,cameray);
         }
      }
      
      protected function hideResourcePool() : void
      {
         if(m_resourcePoolLabel != null)
         {
            m_resourcePoolLabel.parent.removeChild(m_resourcePoolLabel);
            m_resourcePoolLabel = null;
         }
      }
      
      protected function selectUnit(a_unit:Unit) : void
      {
         var unitOptions:GameSprite;
         var ignoreBuildings:Array;
         var allNodes:Array;
         var moreOptionsButton:TileSheetButton;
         var touched:Dictionary;
         var attackTargets:Array;
         var attacks:Array;
         var tile:Tile;
         var secondMarkerThreshold:int;
         var ignoreUnits:Array;
         var markerThreshold:int;
         var gameManager:GameManager;
         var ranges:Array;
         var resortedNodes:Array;
         var choices:Boolean;
         var rangeNodes:Array;
         var nodes:Array = null;
         var i:int = 0;
         var node:Tile = null;
         var jammedTiles:Array = null;
         var jammedTile:Tile = null;
         var allUnits:Array = null;
         var a:int = 0;
         var possibleJammer:Unit = null;
         var jammerTiles:Array = null;
         var pp:int = 0;
         var j:int = 0;
         var cNode:Tile = null;
         var unit:Unit = null;
         var r:Number = NaN;
         var nodey:Tile = null;
         var connections:Array = null;
         var linked:Boolean = false;
         var target:Unit = null;
         var resources:Number = NaN;
         var wrapper:NodeWrapper = null;
         var b:GameButton = null;
         var t:TileSheet = null;
         var targetGraphic:TileSheet = null;
         var targetOffset:int = 0;
         var at:Boolean = false;
         clearButtons();
         clearUIButtons();
         clearPath();
         lastSelected = a_unit;
         gameManager = GameManager.getInstance();
         gameManager.getGameSpriteScroller().swapDepth(a_unit.getGameUnit(),GameSpriteScroller.TOP);
         tile = gameManager.tileAt(a_unit.getX(),a_unit.getY());
         ranges = new Array();
         rangeNodes = new Array();
         attacks = new Array();
         allNodes = new Array();
         ignoreUnits = new Array(a_unit);
         ignoreBuildings = new Array();
         unitOptions = new GameSprite();
         unitOptions.name = "unitOptions";
         moreOptionsButton = new TileSheetButton("unitOptionsButton");
         moreOptionsButton.enable();
         unitOptions.addChild(moreOptionsButton);
         unitOptions.x = a_unit.getGameUnit().x + (BattalionMain.TILE_WIDTH - moreOptionsButton.width) / 2;
         unitOptions.y = a_unit.getGameUnit().y - 5;
         unitOptions.addEventListener(MouseEvent.CLICK,Delegate.create(this,showUnitMenu,a_unit));
         unitOptions.addEventListener(MouseEvent.ROLL_OVER,Delegate.create(this,chooseMoveHack,new MovePosition(a_unit.getX(),a_unit.getY(),a_unit)));
         GameManager.getInstance().getGameSpriteScroller().add(unitOptions,GameSpriteScroller.ABOVE_ALL);
         buttons.push(unitOptions);
         if(a_unit.getUnitData().hasModifier("Cloaking") || a_unit.getUnitData().isAir())
         {
            jammedTiles = [];
            allUnits = GameManager.getInstance().getUnits();
            for(a = 0; a < allUnits.length; a++)
            {
               possibleJammer = allUnits[a];
               if(!possibleJammer.getController().isAllied(this))
               {
                  if(possibleJammer.getUnitData().hasModifier("Jamming"))
                  {
                     jammerTiles = Astar.range(GameManager.getInstance().tileAt(possibleJammer.getX(),possibleJammer.getY()),0,2);
                     for(pp = 0; pp < jammerTiles.length; pp++)
                     {
                        jammedTile = jammerTiles[pp];
                        if(jammedTiles.indexOf(jammedTile) == -1)
                        {
                           jammedTiles.push(jammedTile);
                        }
                     }
                  }
               }
            }
            drawJammedTiles(jammedTiles);
         }
         if(a_unit.isRanged())
         {
            nodes = Astar.search(tile,null,a_unit);
            if(nodes == null)
            {
               nodes = new Array(tile);
            }
            ranges = Astar.range(tile,a_unit.getUnitData().getWeaponRangeMin(),tile.getTerrain().applyModifiers("attackRange",a_unit,a_unit.getUnitData().getWeaponRangeMax()));
            for(i = ranges.length - 1; i >= 0; i--)
            {
               j = nodes.indexOf(ranges[i]);
               if(j != -1)
               {
                  nodes.splice(j,1);
                  cNode = ranges.splice(i,1)[0];
                  unit = cNode.getUnit();
                  rangeNodes.push(cNode);
                  if(unit != null)
                  {
                     if(!unit.getController().isAllied(a_unit.getController()) && !unit.isCloaked())
                     {
                        attacks.push(rangeNodes.pop());
                     }
                  }
               }
               else
               {
                  unit = ranges[i].getUnit();
                  if(unit != null)
                  {
                     if(!unit.getController().isAllied(a_unit.getController()) && !unit.isCloaked() && gameManager.canWeaponsFireAtTarget(a_unit,unit,true))
                     {
                        attacks.push(ranges.splice(i,1)[0]);
                     }
                  }
               }
            }
         }
         else
         {
            nodes = Astar.search(tile,null,a_unit,0,true);
            if(nodes == null)
            {
               nodes = new Array(tile);
            }
            r = a_unit.getRange();
            for(i = nodes.length - 1; i >= 0; i--)
            {
               if(nodes[i].g > r)
               {
                  unit = nodes[i].getUnit();
                  ranges.push(nodes.splice(i,1)[0]);
                  if(unit != null)
                  {
                     if(!unit.getController().isAllied(a_unit.getController()) && !unit.isCloaked() && gameManager.canWeaponsFireAtTarget(a_unit,unit,true))
                     {
                        attacks.push(ranges.pop());
                     }
                  }
               }
            }
         }
         touched = new Dictionary();
         choices = false;
         for(i = 0; i < nodes.length; i++)
         {
            nodey = nodes[i];
            allNodes.push(new NodeWrapper(nodey,NodeWrapper.MOVE));
            if(nodey.getUnit() == null || nodey.getUnit().isCloaked() && !nodey.getUnit().getController().isAllied(a_unit.getController()) || nodey.getUnit() == a_unit)
            {
               touched[nodey.getX() + "_" + nodey.getY()] = true;
               choices = true;
            }
         }
         if(a_unit.getUnitData().getWeaponType() != UnitData.weaponTypeFromString("none"))
         {
            for(i = 0; i < rangeNodes.length; i++)
            {
               nodey = rangeNodes[i];
               allNodes.push(new NodeWrapper(nodey,NodeWrapper.RANGE_MOVE));
               if(nodey.getUnit() == null || nodey.getUnit().isCloaked() && !nodey.getUnit().getController().isAllied(a_unit.getController()) || nodey.getUnit() == a_unit)
               {
                  touched[nodey.getX() + "_" + nodey.getY()] = true;
                  choices = true;
               }
            }
            for(i = 0; i < ranges.length; i++)
            {
               allNodes.push(new NodeWrapper(ranges[i],NodeWrapper.RANGE));
            }
            for(i = 0; i < attacks.length; i++)
            {
               connections = attacks[i].getConnections();
               linked = false;
               if(a_unit.isRanged())
               {
                  linked = true;
               }
               else
               {
                  for(j = 0; j < connections.length; j++)
                  {
                     nodey = connections[j];
                     if(touched[nodey.getX() + "_" + nodey.getY()] == true)
                     {
                        linked = true;
                        break;
                     }
                  }
               }
               if(linked)
               {
                  target = attacks[i].getUnit();
                  resources = gameManager.resolveAttackCycleInResources(a_unit,target);
                  wrapper = new NodeWrapper(attacks[i],NodeWrapper.ATTACK,2);
                  wrapper.resourceDamage = resources;
                  allNodes.push(wrapper);
               }
               else
               {
                  wrapper = new NodeWrapper(attacks[i],NodeWrapper.RANGE);
                  allNodes.push(wrapper);
               }
            }
         }
         else
         {
            for(i = 0; i < rangeNodes.length; i++)
            {
               allNodes.push(new NodeWrapper(rangeNodes[i],NodeWrapper.MOVE));
               if(rangeNodes[i].getUnit() == null)
               {
                  choices = true;
               }
            }
         }
         attackTargets = [];
         for(i = 0; i < allNodes.length; i++)
         {
            wrapper = allNodes[i];
            if(wrapper.type == NodeWrapper.ATTACK)
            {
               attackTargets.push(wrapper);
            }
         }
         attackTargets.sortOn("resourceDamage");
         markerThreshold = Math.floor(attackTargets.length / 3);
         secondMarkerThreshold = Math.floor(2 * attackTargets.length / 3);
         for(i = 0; i < attackTargets.length; i++)
         {
            wrapper = attackTargets[i];
            if(wrapper.resourceDamage < BAD_TARGET)
            {
               wrapper.sort = 0;
            }
            else if(wrapper.resourceDamage < OK_TARGET)
            {
               wrapper.sort = 2;
            }
            else
            {
               wrapper.sort = 1;
            }
         }
         createClearButton(a_unit);
         resortedNodes = [];
         for(i = 0; i < allNodes.length; i++)
         {
            wrapper = allNodes[i];
            node = allNodes[i].node;
            unit = node.getUnit();
            if(wrapper.type == NodeWrapper.ATTACK || wrapper.type == NodeWrapper.MOVE)
            {
               ignoreBuildings.push(node);
            }
            if(wrapper.type == NodeWrapper.ATTACK || wrapper.type == NodeWrapper.RANGE || choices || nodes[i] == tile)
            {
               if(wrapper.type == NodeWrapper.MOVE)
               {
                  b = new GameButton(new BitmapSprite(AssetLibrary.createBitmapData("select")),"move");
                  b.value = new MovePosition(node.getX(),node.getY(),a_unit);
               }
               else if(wrapper.type == NodeWrapper.ATTACK)
               {
                  b = new GameButton(new BitmapSprite(AssetLibrary.createBitmapData("selectRed")),"attack");
                  targetGraphic = TileSheetManager.getInstance().get("attackTargets");
                  targetGraphic.noAnimation = true;
                  targetGraphic.setFrame(int(wrapper.sort));
                  targetGraphic.mouseEnabled = false;
                  targetGraphic.mouseChildren = false;
                  targetOffset = 0;
                  targetGraphic.x = node.getGameTile().x + targetOffset;
                  targetGraphic.y = node.getGameTile().y + targetOffset;
                  if(targetGraphic.x < 0)
                  {
                     targetGraphic.x = targetGraphic.width - targetOffset;
                     targetGraphic.scaleX = -1;
                  }
                  if(targetGraphic.y < 0)
                  {
                     targetGraphic.y = 0;
                  }
                  gameManager.getGameSpriteScroller().add(targetGraphic,GameSpriteScroller.ABOVE_ALL);
                  buttons.push(targetGraphic);
                  b.value = new MovePosition(node.getX(),node.getY(),a_unit,true);
               }
               else if(wrapper.type == NodeWrapper.RANGE)
               {
                  b = new GameButton(new BitmapSprite(AssetLibrary.createBitmapData("selectOrange")));
               }
               else
               {
                  b = new GameButton(new BitmapSprite(AssetLibrary.createBitmapData("selectMixed")),"move");
                  b.value = new MovePosition(node.getX(),node.getY(),a_unit);
               }
               if(wrapper.type != NodeWrapper.RANGE)
               {
                  b.mouseOver = function():void
                  {
                     chooseMove(this.value);
                  };
                  at = false;
                  if(node.getUnit() != null)
                  {
                     at = node.getUnit().isCloaked() && node.getUnit().getController() != a_unit.getController();
                     if(node.getUnit() == a_unit)
                     {
                        b.setCursor("option");
                     }
                  }
                  if(wrapper.type == NodeWrapper.ATTACK || node.getUnit() == null || node == tile || at)
                  {
                     b.release = function():void
                     {
                        GameManager.getInstance().getGameSpriteScroller().swapDepth(a_unit.getGameUnit(),GameSpriteScroller.UNITS);
                        selectMove(this.value);
                     };
                     if(node == tile)
                     {
                        b.addChild(new BitmapSprite(AssetLibrary.createBitmapData("marker")));
                     }
                  }
                  else if(unit != null)
                  {
                     if(unit.getController() == a_unit.getController() && unit.isAlive() && unit.isDeployed() && unit.isAvailable())
                     {
                        b.value = unit;
                        b.release = function():void
                        {
                           GameManager.getInstance().getGameSpriteScroller().swapDepth(a_unit.getGameUnit(),GameSpriteScroller.UNITS);
                           selectUnit(this.value);
                        };
                        b.addChild(new BitmapSprite(AssetLibrary.createBitmapData("marker")));
                        ignoreUnits.push(unit);
                        b.setCursor("select");
                     }
                  }
               }
               else if(unit != null)
               {
                  if(unit.getController() == a_unit.getController() && unit.isAlive() && unit.isDeployed() && unit.isAvailable())
                  {
                     b.value = unit;
                     b.release = function():void
                     {
                        GameManager.getInstance().getGameSpriteScroller().swapDepth(a_unit.getGameUnit(),GameSpriteScroller.UNITS);
                        selectUnit(this.value);
                     };
                     b.addChild(new BitmapSprite(AssetLibrary.createBitmapData("marker")));
                     b.setCursor("select");
                     ignoreUnits.push(unit);
                  }
               }
               b.x = node.getGameTile().x;
               b.y = node.getGameTile().y;
               if(wrapper.type == NodeWrapper.RANGE && b.value == null)
               {
                  gameManager.getGameSpriteScroller().add(b,GameSpriteScroller.TOP);
               }
               else
               {
                  gameManager.getGameSpriteScroller().add(b,GameSpriteScroller.BUTTONS);
               }
               buttons.push(b);
            }
         }
         chooseMove(new MovePosition(a_unit.getX(),a_unit.getY(),a_unit));
         selectUnits(ignoreUnits);
         selectBuildings(ignoreBuildings);
      }
      
      protected function controlListener(a_trigger:Trigger) : void
      {
         if(control && enabled)
         {
            receiveControl();
         }
      }
      
      protected function endTurnHandler(a_event:Event) : void
      {
         endTurn(EndTurnAction.REASON_VOLUNTARY);
      }
      
      protected function moveUndoHandler(a_event:Event) : void
      {
         if(!GameManager.getInstance().getMoveUndoButton().enabled)
         {
            return;
         }
         if(GameManager.getInstance().isMoraleEnabled && morale + MoraleChangeAmounts.UNDO_MOVE <= 0)
         {
            return;
         }
         if(GameManager.getInstance().isMoraleEnabled)
         {
            StatusUI.getInstance().addMessage("info","Undo Penalty","Undoing incurs a troop morale penalty of " + Math.round(MoraleChangeAmounts.UNDO_MOVE * 100) + "%.");
         }
         undoMove();
         updateUndoMoveButton();
         GameManager.getInstance().getMoveUndoButton().disable();
      }
      
      internal function showUnitMenu(a_event:MouseEvent, a_unit:Unit) : void
      {
         var cancel:TileSheetButton;
         var unitMenu:GameSprite;
         var bgPadding:int;
         var mapHasStructures:Boolean;
         var buttonWidth:Number;
         var background:Sprite;
         var startX:int;
         var startY:int;
         var windowWidth:int;
         var cancelOnly:Boolean;
         var cameraLeft:int;
         var width:int;
         var map:Map;
         var b:GameButton;
         var flip:Boolean;
         var z:int;
         var gameButton:GameSprite = null;
         var isAlbatrossFree:Boolean = false;
         var albatrossCost:int = 0;
         var air:TileSheetButton = null;
         var isLeviathanFree:Boolean = false;
         var tile:Tile = null;
         var leviathanCost:int = 0;
         var sea:TileSheetButton = null;
         var bUD:UnitData = null;
         var drop:TileSheetButton = null;
         var canAffordAUnit:Boolean = false;
         var unitDatas:Array = null;
         var ud:int = 0;
         var build:TileSheetButton = null;
         var unitData:UnitData = null;
         var neighbors:Array = null;
         var hasOpenNeighbor:Boolean = false;
         var i:int = 0;
         var neighbor:Tile = null;
         var extract:TileSheetButton = null;
         var repairCost:int = 0;
         var repair:TileSheetButton = null;
         var toolTipMessage:String = null;
         var moraleRepairCost:Number = NaN;
         var toolTipMessage2:String = null;
         GameManager.getInstance().getCamera().setEnabled(false);
         chooseMove(new MovePosition(a_unit.getX(),a_unit.getY(),a_unit));
         clearButtons();
         for(z = 0; z < buttons.length; z++)
         {
            gameButton = buttons[z];
            if(gameButton.name == "unitOptions")
            {
            }
         }
         cancelOnly = true;
         createClearButton(a_unit);
         selectUnits(new Array(a_unit));
         b = new GameButton(new BitmapSprite(AssetLibrary.createBitmapData("marker")));
         b.release = function():void
         {
            receiveControl();
         };
         b.x = a_unit.getGameUnit().x;
         b.y = a_unit.getGameUnit().y;
         GameManager.getInstance().getGameSpriteScroller().add(b,GameSpriteScroller.BUTTONS);
         buttons.push(b);
         unitMenu = new GameSprite();
         GameManager.getInstance().getGameSpriteScroller().add(unitMenu,GameSpriteScroller.BUTTONS);
         buttons.push(unitMenu);
         startX = 0;
         startY = 0;
         buttonWidth = 36;
         flip = true;
         map = GameManager.getInstance().getMap();
         mapHasStructures = map.hasStructures();
         if(!a_unit.isUpgraded())
         {
            if(a_unit.getUnitData().isGround())
            {
               if(a_unit.getUnitData().getName().indexOf("Commando") >= 0)
               {
                  isAlbatrossFree = !mapHasStructures;
                  albatrossCost = UnitManager.getInstance().get("Albatross Transport").getCost(this);
                  if(isAlbatrossFree)
                  {
                     albatrossCost = 0;
                  }
                  air = new TileSheetButton("unitAlbatross");
                  air.enable();
                  b = new GameButton(air,"option",true);
                  unitMenu.addChild(b);
                  b.value = a_unit;
                  if(isAlbatrossFree || controlsAir() && getResources() >= albatrossCost)
                  {
                     if(albatrossCost == 0)
                     {
                        ToolTip.createToolTip(b,"Order Albatross","Order Albatross pickup.");
                     }
                     else
                     {
                        ToolTip.createToolTip(b,"Order Albatross","Order Albatross pickup for $" + albatrossCost);
                     }
                     b.release = function():void
                     {
                        upgradeUnits(this.value,true,"Albatross Transport");
                     };
                  }
                  else if(controlsAir() && getResources() < albatrossCost)
                  {
                     ToolTip.createToolTip(b,"Albatross Unavailable","You need $" + albatrossCost + " to order an Albatross pickup.");
                     b.turnOffGlow();
                     air.disable();
                     b.alpha = 0.7;
                     b.release = function():void
                     {
                        clear(false);
                     };
                  }
                  else if(map.hasAirControl)
                  {
                     ToolTip.createToolTip(b,"Albatross Unavailable","Capture an Air Control to enable Albatross pick up.");
                     b.turnOffGlow();
                     air.disable();
                     b.alpha = 0.7;
                     b.release = function():void
                     {
                        clear(false);
                     };
                  }
                  else
                  {
                     ToolTip.createToolTip(b,"Albatross Unavailable","This map does not allow for an Albatross pickup.");
                     b.turnOffGlow();
                     air.disable();
                     b.alpha = 0.7;
                     b.release = function():void
                     {
                        clear(false);
                     };
                  }
                  b.x = startX;
                  b.y = startY;
                  startX += buttonWidth;
                  cancelOnly = false;
                  flip = false;
               }
               if(a_unit.getUnitData().getRange() > 0)
               {
                  isLeviathanFree = !mapHasStructures || !map.isClassic();
                  tile = GameManager.getInstance().tileAt(a_unit.getX(),a_unit.getY());
                  leviathanCost = UnitManager.getInstance().get("Leviathan Barge").getCost(this);
                  if(isLeviathanFree)
                  {
                     leviathanCost = 0;
                  }
                  sea = new TileSheetButton("unitLeviathan");
                  sea.enable();
                  b = new GameButton(sea,"option",true);
                  unitMenu.addChild(b);
                  b.value = a_unit;
                  if(mapHasStructures && !map.hasSeaControl && !isLeviathanFree)
                  {
                     ToolTip.createToolTip(b,"Leviathan Unavailable","This map does not allow for a Leviathan pickup.");
                     b.alpha = 0.7;
                     b.turnOffGlow();
                     sea.disable();
                     b.release = function():void
                     {
                        clear(false);
                     };
                  }
                  else if((isLeviathanFree || controlsSea()) && tile.couldUnitMoveAwayFromThisTile("Leviathan Barge") && tile.getTerrain().hasModifier("Shore"))
                  {
                     if(getResources() >= leviathanCost)
                     {
                        if(leviathanCost == 0)
                        {
                           ToolTip.createToolTip(b,"Order Leviathan","Order Leviathan pickup");
                        }
                        else
                        {
                           ToolTip.createToolTip(b,"Order Leviathan","Order Leviathan pickup for $" + leviathanCost);
                        }
                        b.release = function():void
                        {
                           upgradeUnits(this.value,true,"Leviathan Barge");
                        };
                     }
                     else
                     {
                        ToolTip.createToolTip(b,"Leviathan Unavailable","You need $" + leviathanCost + " to order a Leviathan pickup.");
                        b.alpha = 0.7;
                        b.turnOffGlow();
                        sea.disable();
                        b.release = function():void
                        {
                           clear(false);
                        };
                     }
                  }
                  else if(!controlsSea() && map.hasSeaControl)
                  {
                     ToolTip.createToolTip(b,"Leviathan Unavailable","Capture a Sea Control to enable Leviathan pick up.");
                     b.alpha = 0.7;
                     b.turnOffGlow();
                     sea.disable();
                     b.release = function():void
                     {
                        clear(false);
                     };
                  }
                  else if(!tile.getTerrain().hasModifier("Shore"))
                  {
                     ToolTip.createToolTip(b,"Leviathan Unavailable","You must be standing on a Shore square to call a Leviathan pickup.");
                     b.alpha = 0.7;
                     b.turnOffGlow();
                     sea.disable();
                     b.release = function():void
                     {
                        clear(false);
                     };
                  }
                  else if(!tile.couldUnitMoveAwayFromThisTile("Leviathan Barge"))
                  {
                     ToolTip.createToolTip(b,"Leviathan Unavailable","You must be standing next to a Sea square to call a Leviathan pickup.");
                     b.alpha = 0.7;
                     b.turnOffGlow();
                     sea.disable();
                     b.release = function():void
                     {
                        clear(false);
                     };
                  }
                  b.x = startX;
                  b.y = startY;
                  startX += buttonWidth;
                  cancelOnly = false;
                  flip = false;
               }
            }
         }
         else
         {
            tile = GameManager.getInstance().tileAt(a_unit.getX(),a_unit.getY());
            bUD = a_unit.getBaseUnitData();
            drop = new TileSheetButton("unitUnload");
            drop.enable();
            b = new GameButton(drop,"option");
            unitMenu.addChild(b);
            b.value = a_unit;
            if(tile.getCost(new Unit(new GameUnit(new GameSprite()),bUD,0,0,a_unit.getController())) != Number.POSITIVE_INFINITY)
            {
               ToolTip.createToolTip(b,"Unpack " + bUD.getName(),"Unpack and deploy the " + bUD.getName() + ".");
               b.release = function():void
               {
                  upgradeUnits(this.value,false);
               };
            }
            else
            {
               ToolTip.createToolTip(b,"Unpack Unavailable","The " + bUD.getName() + " cannot be unpacked on this square.");
               b.turnOffGlow();
               drop.disable();
               b.alpha = 0.7;
               b.release = function():void
               {
                  clear(false);
               };
            }
            b.x = startX;
            b.y = startY;
            startX += buttonWidth;
            cancelOnly = false;
            flip = false;
         }
         if(a_unit.getUnitData().hasModifier("Constructor"))
         {
            canAffordAUnit = false;
            unitDatas = UnitManager.getInstance().getAll();
            for(ud = 0; ud < unitDatas.length; ud++)
            {
               unitData = unitDatas[ud];
               if(unitData.getCost() <= a_unit.resourcePool)
               {
                  canAffordAUnit = true;
                  break;
               }
            }
            build = new TileSheetButton("unitBuild");
            build.enable();
            b = new GameButton(build,"option");
            unitMenu.addChild(b);
            if(canAffordAUnit)
            {
               neighbors = tile.getConnections();
               hasOpenNeighbor = false;
               for(i = 0; i < neighbors.length; i++)
               {
                  neighbor = neighbors[i];
                  if(neighbor.getUnit() == null)
                  {
                     hasOpenNeighbor = true;
                     break;
                  }
               }
               if(hasOpenNeighbor)
               {
                  ToolTip.createToolTip(b,"Build","Use the Warmachine\'s Ore to construct a new unit.");
                  b.value = a_unit;
                  b.release = function():void
                  {
                     buildUnitFromWarmachine(this.value);
                  };
               }
               else
               {
                  ToolTip.createToolTip(b,"Build Unavailable","Build requires at least 1 unoccupied adjacent tile.");
                  b.turnOffGlow();
                  build.disable();
                  b.alpha = 0.7;
                  b.release = function():void
                  {
                     clear(false);
                  };
               }
            }
            else
            {
               ToolTip.createToolTip(b,"Build Unavailable","Out of Resources");
               b.turnOffGlow();
               build.disable();
               b.alpha = 0.7;
               b.release = function():void
               {
                  clear(false);
               };
            }
            b.x = startX;
            b.y = startY;
            startX += buttonWidth;
            cancelOnly = false;
         }
         if(a_unit.getUnitData().hasModifier("Extractor"))
         {
            extract = new TileSheetButton("unitExtract");
            extract.enable();
            b = new GameButton(extract,"option");
            unitMenu.addChild(b);
            if(tile.getTerrain().hasModifier("Extractable"))
            {
               ToolTip.createToolTip(b,"Extract Resources","Extract resources from this tile.");
               b.value = a_unit;
               b.release = function():void
               {
                  extractResources(this.value);
               };
            }
            else
            {
               ToolTip.createToolTip(b,"Extract Unavailable","No resources can be extracted from this tile.");
               b.turnOffGlow();
               extract.disable();
               b.alpha = 0.7;
               b.release = function():void
               {
                  clear(false);
               };
            }
            b.x = startX;
            b.y = startY;
            startX += buttonWidth;
            cancelOnly = false;
         }
         if(!a_unit.isUpgraded())
         {
            repairCost = Math.round(a_unit.getUnitData().getCost(this) * GameManager.getInstance().healPercentage(a_unit));
            repair = new TileSheetButton("unitRepair");
            repair.enable();
            b = new GameButton(repair,"option");
            unitMenu.addChild(b);
            if(a_unit.getUnitData().hasModifier("Irreparable"))
            {
               toolTipMessage = "This unit can never be repaired.";
               ToolTip.createToolTip(b,"Repair Unavailable",toolTipMessage);
               b.turnOffGlow();
               repair.disable();
               b.alpha = 0.7;
               b.release = function():void
               {
                  clear(false);
               };
            }
            else if(GameManager.getInstance().getMap().isClassic())
            {
               if(getResources() >= repairCost && a_unit.getHealth() < a_unit.getUnitData().getHealth())
               {
                  ToolTip.createToolTip(b,"Repair","Start repair for $" + repairCost);
                  b.value = a_unit;
                  b.release = function():void
                  {
                     repairUnits(this.value);
                  };
               }
               else
               {
                  toolTipMessage = "You need $" + repairCost + " to repair this unit.";
                  if(a_unit.getHealth() >= a_unit.getUnitData().getHealth())
                  {
                     toolTipMessage = "Unit is at full health.";
                  }
                  ToolTip.createToolTip(b,"Repair Unavailable",toolTipMessage);
                  b.turnOffGlow();
                  repair.disable();
                  b.alpha = 0.7;
                  b.release = function():void
                  {
                     clear(false);
                  };
               }
            }
            else if(a_unit.getHealth() < a_unit.getUnitData().getHealth())
            {
               if(GameManager.getInstance().isMoraleEnabled)
               {
                  moraleRepairCost = a_unit.getUnitData().getCost(this) * GameManager.getInstance().healPercentage(a_unit) * MoraleChangeAmounts.REPAIR_UNIT;
                  toolTipMessage2 = "Repairing this unit will incur " + GameManager.getInstance().roundMorale(moraleRepairCost) + "% morale penalty.";
                  ToolTip.createToolTip(b,"Repair",toolTipMessage2);
                  b.value = a_unit;
                  b.release = function():void
                  {
                     repairUnits(this.value);
                  };
               }
               else
               {
                  ToolTip.createToolTip(b,"Repair","Repair up to one full chunk of the unit\'s health.");
                  b.value = a_unit;
                  b.release = function():void
                  {
                     repairUnits(this.value);
                  };
               }
            }
            else
            {
               ToolTip.createToolTip(b,"Repair Unavailable","Unit is at full health.");
               b.turnOffGlow();
               repair.disable();
               b.alpha = 0.7;
               b.release = function():void
               {
                  clear(false);
               };
            }
            b.x = startX;
            b.y = startY;
            startX += buttonWidth;
            cancelOnly = false;
         }
         cancel = new TileSheetButton("unitCancel");
         cancel.enable();
         b = new GameButton(cancel,"option",false);
         unitMenu.addChild(b);
         ToolTip.createToolTip(b,"Cancel","Cancel unit selection");
         b.release = function():void
         {
            receiveControl();
         };
         b.value = a_unit;
         b.x = startX - cancel.width / 2;
         b.y = startY - cancel.height / 2;
         background = new Sprite();
         background.graphics.beginFill(16777215,1);
         background.graphics.lineStyle(2,0,1);
         bgPadding = 3;
         background.graphics.drawRoundRect(-bgPadding,-bgPadding,startX + bgPadding * 2,29 + bgPadding * 2,12);
         unitMenu.addChildAt(background,0);
         unitMenu.y = a_unit.getY() * TileManager.getInstance().getHeight() - 14;
         if(unitMenu.y < 0)
         {
            unitMenu.y = 0;
         }
         unitMenu.x = (a_unit.getX() + 0.5) * TileManager.getInstance().getWidth() - startX / 2;
         width = GameManager.getInstance().getMap().getWidth() * TileManager.getInstance().getWidth();
         if(unitMenu.x < 0)
         {
            unitMenu.x = 0;
         }
         else if(unitMenu.x + unitMenu.width > width)
         {
            unitMenu.x = width - unitMenu.width;
         }
         cameraLeft = GameManager.getInstance().getCamera().getX();
         windowWidth = GameManager.GAME_WIDTH / GameManager.getInstance().getCamera().zoom;
         if(unitMenu.x + unitMenu.width > windowWidth - cameraLeft)
         {
            unitMenu.x = windowWidth - cameraLeft - unitMenu.width;
         }
         else if(unitMenu.x < -cameraLeft)
         {
            unitMenu.x = -cameraLeft;
         }
      }
      
      internal function clearUI() : void
      {
         clearUIButtons();
         clearButtons();
         clearPath();
      }
      
      public function addAllCanAttackMyUnitIndicators(a_unit:Unit, a_desiredX:int, a_desiredY:int) : void
      {
         var allUnits:Array = null;
         var unitIndex:int = 0;
         var potentialEnemyUnit:Unit = null;
         var cellsSeparating:int = 0;
         var canWeaponsFireAtUs:Boolean = false;
         var desiredTile:Tile = null;
         var canReachTile:Boolean = false;
         var resources:Number = NaN;
         var POSSIBLE_TERRAIN_MAX_RANGE_BOOST:int = 0;
         var startingTile:Tile = null;
         var turns:int = 0;
         var game:GameManager = GameManager.getInstance();
         var isRealUnit:Boolean = true;
         if(a_unit.getTile().getUnit() != a_unit)
         {
            isRealUnit = false;
         }
         if(isRealUnit)
         {
            a_unit.getTile().setUnit(null);
         }
         try
         {
            allUnits = GameManager.getInstance().getUnits();
            for(unitIndex = 0; unitIndex < allUnits.length; unitIndex++)
            {
               potentialEnemyUnit = allUnits[unitIndex];
               if(!potentialEnemyUnit.isCloaked())
               {
                  if(!potentialEnemyUnit.getController().isAllied(a_unit.getController()))
                  {
                     cellsSeparating = Math.abs(a_desiredX - potentialEnemyUnit.getX()) + Math.abs(a_desiredY - potentialEnemyUnit.getY());
                     if(potentialEnemyUnit.isRanged())
                     {
                        if(cellsSeparating < potentialEnemyUnit.getWeaponRangeMin())
                        {
                           continue;
                        }
                        POSSIBLE_TERRAIN_MAX_RANGE_BOOST = 1;
                        if(cellsSeparating > potentialEnemyUnit.getWeaponRangeMax() + POSSIBLE_TERRAIN_MAX_RANGE_BOOST)
                        {
                           continue;
                        }
                     }
                     else if(cellsSeparating > potentialEnemyUnit.getRange() + 1)
                     {
                        continue;
                     }
                     canWeaponsFireAtUs = game.canWeaponsFireAtTarget(potentialEnemyUnit,a_unit,true,potentialEnemyUnit.getX(),potentialEnemyUnit.getY(),a_desiredX,a_desiredY);
                     if(canWeaponsFireAtUs)
                     {
                        desiredTile = game.tileAt(a_desiredX,a_desiredY);
                        canReachTile = game.canAttackTile(potentialEnemyUnit,desiredTile,true,-1,-1,true);
                        if(canReachTile)
                        {
                           if(canReachTile && !potentialEnemyUnit.isRanged())
                           {
                              startingTile = GameManager.getInstance().tileAt(potentialEnemyUnit.getX(),potentialEnemyUnit.getY());
                              turns = DistanceQueries.calculateTurnsToBeingInAttackRange(startingTile,desiredTile,potentialEnemyUnit);
                              if(turns > 1 || turns < 0)
                              {
                                 continue;
                              }
                           }
                           resources = GameManager.getInstance().resolveAttackCycleInResources(potentialEnemyUnit,a_unit);
                           addCanAttackMyUnitIndicator(potentialEnemyUnit,resources);
                        }
                     }
                  }
               }
            }
         }
         finally
         {
            if(isRealUnit)
            {
               a_unit.getTile().setUnit(a_unit);
            }
         }
      }
      
      public function roundMorale(a_amount:Number) : int
      {
         return Math.ceil(a_amount * 100);
      }
      
      protected function leaveGameHandler(a_event:Event) : void
      {
         GameManager.getInstance().getParent().endGame(false);
      }
      
      protected function nextUnitHandler(a_event:Event) : void
      {
         selectNextUnit();
      }
      
      protected function createClearButton(a_unit:Unit = null) : void
      {
         var b:GameButton;
         var gs:GameSprite = new GameSprite();
         gs.graphics.beginFill(16777215,0);
         gs.graphics.drawRect(0,0,GameManager.getInstance().getMap().getWidth() * TileManager.getInstance().getWidth(),GameManager.getInstance().getMap().getHeight() * TileManager.getInstance().getHeight());
         gs.graphics.endFill();
         b = new GameButton(gs);
         if(a_unit)
         {
            b.release = function():void
            {
               GameManager.getInstance().getGameSpriteScroller().swapDepth(a_unit.getGameUnit(),GameSpriteScroller.UNITS);
               receiveControl();
            };
         }
         else
         {
            b.release = function():void
            {
               receiveControl();
            };
         }
         GameManager.getInstance().getGameSpriteScroller().add(b,GameSpriteScroller.BUTTONS);
         buttons.push(b);
      }
      
      override public function update(a_ms:uint = 0) : void
      {
         super.update(a_ms);
         if(buildMenu != null)
         {
            buildMenu.update(a_ms);
         }
         if(wmBuildMenu != null)
         {
            wmBuildMenu.update(a_ms);
         }
      }
      
      internal function labelledGameButton(a_sprite:GameSprite, a_label:String) : GameButton
      {
         var b:GameButton = new GameButton(a_sprite,"select");
         var tf:TextField = new DefaultTextField();
         tf.width = tf.height = 500;
         tf.text = a_label;
         tf.width = tf.textWidth + 5;
         tf.height = tf.textHeight + 5;
         tf.x = a_sprite.width;
         b.addChild(tf);
         return b;
      }
      
      protected function selectNextUnit() : void
      {
         if(units == null || units.length <= 1)
         {
            return;
         }
         var startIndex:int = 0;
         for(var i:int = 0; i < units.length; i++)
         {
            if(units[i] == lastSelected)
            {
               startIndex = i;
               break;
            }
         }
         for(i = startIndex + 1; i < units.length; i++)
         {
            if(units[i].isAvailable())
            {
               selectUnit(units[i]);
               GameManager.getInstance().getCamera().setTarget(units[i].getGameUnit(),500);
               return;
            }
         }
         for(i = 0; i < startIndex; i++)
         {
            if(units[i].isAvailable())
            {
               selectUnit(units[i]);
               GameManager.getInstance().getCamera().setTarget(units[i].getGameUnit(),500);
               return;
            }
         }
      }
      
      override public function showCloak() : Boolean
      {
         return true;
      }
      
      override protected function startCurrentTurn() : void
      {
         super.startCurrentTurn();
         control = true;
         updateUnitCloaking();
      }
      
      private function undoMove() : void
      {
         if(m_undoAction == null)
         {
            return;
         }
         if(m_undoAction != null)
         {
            ActionManager.getInstance().add(m_undoAction);
         }
         m_undoAction = null;
      }
      
      protected function selectBuilding(a_tile:Tile) : void
      {
         clearButtons();
         createClearButton();
         GameManager.getInstance().getCamera().setTarget(a_tile.getGameTile(),500);
         buildMenu = new BuildMenu(this,a_tile);
         buildMenu.x = GameManager.getInstance().getSprite().x;
         buildMenu.y = GameManager.getInstance().getSprite().y;
         GameManager.getInstance().getCamera().setEnabled(false);
         GameManager.getInstance().getParent().addChild(buildMenu);
      }
      
      private function chooseMoveHack(a_event:Event, a_position:MovePosition) : void
      {
         chooseMove(a_position);
      }
      
      internal function buildUnitFromWarmachine(a_unit:Unit) : void
      {
         var originTile:Tile = GameManager.getInstance().tileAt(a_unit.getX(),a_unit.getY());
         clearUI();
         if(originTile != null)
         {
            wmBuildMenu = new WMBuildMenu(this,originTile);
            wmBuildMenu.x = GameManager.getInstance().getSprite().x;
            wmBuildMenu.y = GameManager.getInstance().getSprite().y;
            GameManager.getInstance().getCamera().setEnabled(false);
            GameManager.getInstance().getParent().addChild(wmBuildMenu);
         }
      }
      
      public function clear(a_killUndoAction:Boolean) : void
      {
         if(a_killUndoAction)
         {
            m_undoAction = null;
            updateUndoMoveButton();
         }
         clearUIButtons();
         receiveControl();
      }
      
      protected function selectUnits(a_ignoreUnits:Array = null, a_ignoreEnemies:Array = null) : void
      {
         var done:int;
         var u:Unit = null;
         var b:GameButton = null;
         if(a_ignoreUnits == null)
         {
            a_ignoreUnits = new Array();
         }
         if(a_ignoreEnemies == null)
         {
            a_ignoreEnemies = new Array();
         }
         done = 0;
         for each(u in units)
         {
            if(a_ignoreUnits.indexOf(u) == -1)
            {
               if(u.isAlive() && u.isDeployed() && u.isAvailable())
               {
                  b = new GameButton(new BitmapSprite(AssetLibrary.createBitmapData("marker")),"select");
                  b.value = u;
                  b.release = function():void
                  {
                     selectUnit(this.value);
                  };
                  b.mouseOver = function():void
                  {
                     showResourcePool(this.value);
                  };
                  b.mouseOut = function():void
                  {
                     hideResourcePool();
                  };
                  b.x = u.getGameUnit().x;
                  b.y = u.getGameUnit().y;
                  GameManager.getInstance().getGameSpriteScroller().add(b,GameSpriteScroller.BUTTONS);
                  buttons.push(b);
                  done++;
               }
            }
         }
         if(a_ignoreUnits.length == 0)
         {
            for each(u in GameManager.getInstance().getUnits())
            {
               if(u.getController() != this)
               {
                  if(u.isSelectable() && u.isAlive() && u.isDeployed())
                  {
                     if(!(u.isCloaked() && !u.getController().isAllied(this)))
                     {
                        b = new GameButton(new BitmapSprite(AssetLibrary.createBitmapData("marker2")),"select");
                        b.value = u;
                        b.release = function():void
                        {
                           selectEnemyUnit(this.value);
                        };
                        b.mouseOver = function():void
                        {
                           showResourcePool(this.value);
                        };
                        b.mouseOut = function():void
                        {
                           hideResourcePool();
                        };
                        b.x = u.getGameUnit().x;
                        b.y = u.getGameUnit().y;
                        GameManager.getInstance().getGameSpriteScroller().add(b,GameSpriteScroller.BUTTONS);
                        buttons.push(b);
                     }
                  }
               }
            }
         }
         if(done == 0)
         {
         }
      }
      
      private function drawJammedTiles(jammedTiles:Array, a_doJammingTiles:Boolean = true) : void
      {
         var color:uint = 0;
         var lineAlpha:Number = NaN;
         var colorAlpha:Number = NaN;
         var lineThickness:int = 0;
         var jammedTile:Tile = null;
         var n:int = 0;
         var neighbor:Tile = null;
         if(jammedTiles == null)
         {
            return;
         }
         if(jammedTiles.length <= 0)
         {
            return;
         }
         if(a_doJammingTiles)
         {
            color = 16777215;
            lineAlpha = 0.5;
            colorAlpha = 0.1;
            lineThickness = 2;
         }
         else
         {
            color = 16711680;
            lineAlpha = 0.1;
            colorAlpha = 0.1;
            lineThickness = 1;
         }
         if(m_jammedOverlay != null)
         {
            m_jammedOverlay.parent.removeChild(m_jammedOverlay);
         }
         m_jammedOverlay = new GameSprite();
         GameManager.getInstance().getGameSpriteScroller().add(m_jammedOverlay,GameSpriteScroller.BELOW_UNITS);
         m_jammedOverlay.graphics.beginFill(color,colorAlpha);
         var neighborsX:Array = [-1,1,0,0];
         var neighborsY:Array = [0,0,-1,1];
         var startX:Array = [0,1,0,0];
         var endX:Array = [0,1,1,1];
         var startY:Array = [0,0,0,1];
         var endY:Array = [1,1,0,1];
         for(var zz:int = 0; zz < jammedTiles.length; zz++)
         {
            jammedTile = jammedTiles[zz];
            m_jammedOverlay.graphics.lineStyle(0,0,0);
            m_jammedOverlay.graphics.drawRect(jammedTile.getGameTile().x,jammedTile.getGameTile().y,BattalionMain.TILE_WIDTH,BattalionMain.TILE_HEIGHT);
            m_jammedOverlay.graphics.lineStyle(lineThickness,color,lineAlpha);
            for(n = 0; n < neighborsX.length; n++)
            {
               neighbor = GameManager.getInstance().tileAt(jammedTile.getX() + neighborsX[n],jammedTile.getY() + neighborsY[n]);
               if(jammedTiles.indexOf(neighbor) == -1)
               {
                  m_jammedOverlay.graphics.moveTo(jammedTile.getGameTile().x + startX[n] * BattalionMain.TILE_WIDTH,jammedTile.getGameTile().y + startY[n] * BattalionMain.TILE_HEIGHT);
                  m_jammedOverlay.graphics.lineTo(jammedTile.getGameTile().x + endX[n] * BattalionMain.TILE_WIDTH,jammedTile.getGameTile().y + endY[n] * BattalionMain.TILE_HEIGHT);
               }
            }
         }
      }
      
      protected function showResourcePool(a_unit:Unit) : void
      {
         var labelBackground:DisplayObject = null;
         var resourcePoolLabel:TextField = null;
         if(a_unit.resourcePool >= 0)
         {
            m_resourcePoolLabel = new GameSprite();
            labelBackground = new Bitmap(new wm_resources(0,0));
            m_resourcePoolLabel.addChild(labelBackground);
            m_resourcePoolLabel.mouseEnabled = false;
            m_resourcePoolLabel.mouseChildren = false;
            resourcePoolLabel = new DefaultTextField(16777215,"right");
            resourcePoolLabel.text = StringUtils.convertToCurrency(a_unit.resourcePool);
            resourcePoolLabel.width = 54;
            resourcePoolLabel.y = 2;
            m_resourcePoolLabel.addChild(resourcePoolLabel);
            m_resourcePoolLabel.x = a_unit.getGameUnit().x;
            m_resourcePoolLabel.y = a_unit.getGameUnit().y + BattalionMain.TILE_HEIGHT - labelBackground.height;
            GameManager.getInstance().getGameSpriteScroller().add(m_resourcePoolLabel,GameSpriteScroller.ABOVE_ALL);
         }
      }
      
      protected function keyDownHandler(a_event:KeyboardEvent) : void
      {
         if(a_event.keyCode == com.urbansquall.utils.Keyboard.CONTROL)
         {
            if(GameManager.getInstance().getCamera().isEnabled())
            {
               selectNextUnit();
            }
         }
      }
      
      internal function upgradeUnits(a_unit:Unit, a_upgrade:Boolean, a_type:String = "") : void
      {
         ActionManager.getInstance().add(new UpgradeUnitAction(a_unit.getX(),a_unit.getY(),a_upgrade,a_type));
         clearUI();
      }
      
      override protected function endGame() : void
      {
         var b:TileSheetButton = null;
         var n:TileSheetButton = null;
         clearPath();
         clearButtons();
         clearUIButtons();
         if(control)
         {
            b = GameManager.getInstance().getEndTurnButton();
            b.removeEventListener(MouseEvent.CLICK,endTurnHandler);
            b.disable();
            n = GameManager.getInstance().getNextUnitButton();
            n.removeEventListener(MouseEvent.CLICK,nextUnitHandler);
            BattalionMain.getStage().removeEventListener(KeyboardEvent.KEY_DOWN,keyDownHandler);
            n.disable();
            GameManager.getInstance().getParent().mainMenuButton.disable();
            control = false;
            camerax = GameManager.getInstance().getCamera().getX();
            cameray = GameManager.getInstance().getCamera().getY();
            GameManager.getInstance().getCamera().setEnabled(false);
         }
      }
      
      internal function repairUnits(a_unit:Unit) : void
      {
         ActionManager.getInstance().add(new RepairUnitAction(a_unit.getX(),a_unit.getY()));
         clearUI();
      }
      
      protected function clearButtons() : void
      {
         var scroller:GameSpriteScroller = GameManager.getInstance().getGameSpriteScroller();
         for(var i:int = 0; i < buttons.length; i++)
         {
            scroller.remove(buttons[i]);
         }
         buttons = new Array();
      }
      
      override public function surrender() : void
      {
         clearPath();
         clearButtons();
         clearUIButtons();
      }
      
      override public function endTurn(a_reason:int) : void
      {
         if(wmBuildMenu != null)
         {
            wmBuildMenu.cleanup(false);
         }
         clearPath();
         clearButtons();
         clearUIButtons();
         var b:TileSheetButton = GameManager.getInstance().getEndTurnButton();
         b.removeEventListener(MouseEvent.CLICK,endTurnHandler);
         b.disable();
         var n:TileSheetButton = GameManager.getInstance().getNextUnitButton();
         n.removeEventListener(MouseEvent.CLICK,nextUnitHandler);
         BattalionMain.getStage().removeEventListener(KeyboardEvent.KEY_DOWN,keyDownHandler);
         n.disable();
         GameManager.getInstance().getParent().mainMenuButton.disable();
         control = false;
         camerax = GameManager.getInstance().getCamera().getX();
         cameray = GameManager.getInstance().getCamera().getY();
         GameManager.getInstance().getCamera().setEnabled(false);
         ActionManager.getInstance().add(new EndTurnAction(a_reason));
      }
      
      protected function receiveControl() : void
      {
         var unit:Unit = null;
         var turret:Unit = null;
         var nodes:Array = null;
         var hasUnitAvailable:Boolean = false;
         for(var u:int = 0; u < units.length; u++)
         {
            unit = units[u];
            if(unit.isAvailable())
            {
               if(unit.getUnitData().getName() != "Turret")
               {
                  hasUnitAvailable = true;
                  break;
               }
               turret = unit;
               if(turret.getHealthPercentage() < 1)
               {
                  hasUnitAvailable = true;
                  break;
               }
               nodes = GameManager.getInstance().unitsInRange(turret);
               if(nodes.length != 0)
               {
                  hasUnitAvailable = true;
                  break;
               }
               hasUnitAvailable = false;
            }
         }
         var hasFactoryAvailable:Boolean = false;
         for(var f:int = 0; f < structures.length; f++)
         {
            if(structures[f].getTerrain().hasModifier("Construction"))
            {
               if(structures[f].getUnit() == null)
               {
                  hasFactoryAvailable = true;
               }
            }
         }
         if(BattalionMain.IS_ARENA && !hasUnitAvailable && !hasFactoryAvailable)
         {
            StatusUI.getInstance().addMessage("info","Notice","All units have acted. Ending turn automatically.");
            endTurn(EndTurnAction.REASON_NO_UNITS);
            return;
         }
         GameManager.getInstance().getGameSpriteScroller().sortUnits();
         clearPath();
         clearButtons();
         clearUIButtons();
         GameManager.getInstance().getCamera().setEnabled(true);
         var b:TileSheetButton = GameManager.getInstance().getEndTurnButton();
         b.addEventListener(MouseEvent.CLICK,endTurnHandler);
         b.enable();
         var n:TileSheetButton = GameManager.getInstance().getNextUnitButton();
         n.addEventListener(MouseEvent.CLICK,nextUnitHandler);
         BattalionMain.getStage().addEventListener(KeyboardEvent.KEY_DOWN,keyDownHandler,false,0,true);
         n.enable();
         var undoButton:TileSheetButton = GameManager.getInstance().getMoveUndoButton();
         undoButton.addEventListener(MouseEvent.CLICK,moveUndoHandler,false,0,true);
         GameManager.getInstance().getParent().mainMenuButton.enable();
         selectUnits();
         selectBuildings();
      }
      
      override protected function startTurn(a_player:int) : void
      {
         control = false;
         m_undoAction = null;
         updateUndoMoveButton();
         updateUnitCloaking();
      }
   }
}

import com.gamedozer.battalion.data.Node;
import com.gamedozer.battalion.data.Unit;
import com.gamedozer.battalion.data.UnitData;

class NodeWrapper
{
   
   public static const MOVE:int = 0;
   
   public static const RANGE:int = 1;
   
   public static const RANGE_MOVE:int = 2;
   
   public static const ATTACK:int = 3;
   
   public var node:Node;
   
   public var type:int;
   
   public var resourceDamage:Number = 0;
   
   public var sort:Number;
   
   public function NodeWrapper(a_node:Node, a_type:int, a_sort:Number = 0)
   {
      super();
      node = a_node;
      type = a_type;
      sort = a_sort;
   }
}

class MovePosition
{
   
   public var unit:Unit;
   
   public var attack:Boolean;
   
   public var x:int;
   
   public var y:int;
   
   public function MovePosition(a_x:int = -1, a_y:int = -1, a_unit:Unit = null, a_attack:Boolean = false)
   {
      super();
      x = a_x;
      y = a_y;
      unit = a_unit;
      attack = a_attack;
   }
}

class BuildPosition
{
   
   public var unit:UnitData;
   
   public var x:int;
   
   public var y:int;
   
   public function BuildPosition(a_x:int = -1, a_y:int = -1, a_unit:UnitData = null)
   {
      super();
      x = a_x;
      y = a_y;
      unit = a_unit;
   }
}
