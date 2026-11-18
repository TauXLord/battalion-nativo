package com.gamedozer.battalion.display
{
   import com.gamedozer.battalion.data.*;
   import flash.display.*;
   import flash.geom.*;
   import flash.utils.*;
   
   public class GameSpriteScroller extends Sprite
   {
      
      public static const TILES:int = 0;
      
      public static const BOTTOM:int = 1;
      
      public static const BELOW_UNITS:int = 2;
      
      public static const UNITS:int = 3;
      
      public static const ABOVE_UNITS:int = 4;
      
      public static const TOP:int = 5;
      
      public static const BELOW_BUTTONS:int = 6;
      
      public static const BUTTONS:int = 7;
      
      public static const ABOVE_ALL:int = 8;
      
      public static const LAYERS:int = 9;
      
      protected var layers:Array;
      
      protected var oldX:Number;
      
      protected var oldY:Number;

      private var oldZoom:Number = 0;
      
      protected var screenHeight:int;
      
      protected var screenWidth:int;
      
      protected var gameSprites:Array;
      
      public function GameSpriteScroller(a_screenWidth:Number, a_screenHeight:Number)
      {
         super();
         screenWidth = a_screenWidth;
         screenHeight = a_screenHeight;
         oldX = Number.POSITIVE_INFINITY;
         oldY = Number.POSITIVE_INFINITY;
         gameSprites = new Array();
         layers = new Array();
         for(var i:int = 0; i < LAYERS; i++)
         {
            gameSprites[i] = new Array();
            layers[i] = new Sprite();
            addChild(layers[i]);
         }
         layers[LAYERS - 1].mouseEnabled = false;
      }
      
      public function add(a_gameSprite:GameSprite, a_depth:int) : void
      {
         gameSprites[a_depth].push(a_gameSprite);
         layers[a_depth].addChild(a_gameSprite);
         oldX = Number.POSITIVE_INFINITY;
         oldY = Number.POSITIVE_INFINITY;
      }
      
      public function lock(a_width:Number, a_height:Number) : void
      {
         if(x < -a_width + screenWidth)
         {
            x = -a_width + screenWidth;
         }
         if(y < -a_height + screenHeight)
         {
            y = -a_height + screenHeight;
         }
         if(x > 0)
         {
            x = 0;
         }
         if(y > 0)
         {
            y = 0;
         }
      }
      
      public function scroll(forceScroll:Boolean = false) : void
      {
         var gameSpriteLayer:Array = null;
         var gameSprite:GameSprite = null;
         var gameSpriteXMax:Number = NaN;
         var gameSpriteYMax:Number = NaN;
         var viewChanged:Boolean = x != oldX || y != oldY || scaleX != oldZoom;
         if(!viewChanged && !forceScroll)
         {
            return;
         }
         oldX = x;
         oldY = y;
         oldZoom = scaleX;
         var xMin:Number = -x / scaleX;
         var yMin:Number = -y / scaleY;
         var xMax:Number = xMin + screenWidth / scaleX;
         var yMax:Number = yMin + screenHeight / scaleY + TileManager.getInstance().getHeight();
         for(var depth:int = viewChanged ? TILES : TILES + 1; depth < LAYERS; depth++)
         {
            gameSpriteLayer = gameSprites[depth];
            for each(gameSprite in gameSpriteLayer)
            {
               gameSpriteXMax = gameSprite.x + gameSprite.width;
               gameSpriteYMax = gameSprite.y + gameSprite.height;
               if(gameSpriteXMax > xMin && gameSprite.x < xMax && gameSpriteYMax > yMin && gameSprite.y < yMax)
               {
                  gameSprite.visible = true;
               }
               else
               {
                  gameSprite.visible = false;
               }
            }
         }
      }
      
      public function swapDepth(a_gameSprite:GameSprite, a_depth:int) : void
      {
         remove(a_gameSprite);
         add(a_gameSprite,a_depth);
      }
      
      public function update(a_ms:uint) : void
      {
         var gameSpriteLayer:Array = null;
         var gameSprite:GameSprite = null;
         for(var depth:int = TILES; depth < LAYERS; depth++)
         {
            gameSpriteLayer = gameSprites[depth];
            for each(gameSprite in gameSpriteLayer)
            {
               if(depth != TILES || gameSprite.visible)
               {
                  gameSprite.update(a_ms);
               }
            }
         }
      }
      
      public function remove(a_gameSprite:GameSprite) : void
      {
         var gameSpriteLayer:Array = null;
         var j:* = 0;
         loop0:
         for(var i:int = 0; i < LAYERS; )
         {
            gameSpriteLayer = gameSprites[i];
            j = int(gameSpriteLayer.length - 1);
            while(true)
            {
               if(j < 0)
               {
                  i++;
                  continue loop0;
               }
               if(gameSpriteLayer[j] == a_gameSprite)
               {
                  break;
               }
               j--;
            }
            layers[i].removeChild(a_gameSprite);
            gameSpriteLayer.splice(j,1);
            return;
         }
         trace("ERROR. GameSpriteScroller: Sprite not found: " + a_gameSprite);
      }
      
      public function sortUnits() : void
      {
         var sprite:GameSprite = null;
         var foundSpot:Boolean = false;
         var j:int = 0;
         var depth:int = UNITS;
         var unitSprites:Array = gameSprites[depth];
         var newOrder:Array = [];
         var parent:Sprite = layers[depth];
         for(var i:int = 0; i < unitSprites.length; i++)
         {
            sprite = unitSprites[i];
            foundSpot = false;
            for(j = 0; j < newOrder.length; j++)
            {
               if(sprite.y <= newOrder[j].y)
               {
                  foundSpot = true;
                  newOrder.splice(j,0,sprite);
                  break;
               }
            }
            if(!foundSpot)
            {
               newOrder.push(sprite);
            }
         }
         for(i = 0; i < newOrder.length; i++)
         {
            parent.setChildIndex(newOrder[i],i);
         }
      }
   }
}

