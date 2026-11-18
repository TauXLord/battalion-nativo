package com.gamedozer.battalion.game
{
   import com.gamedozer.battalion.*;
   import com.gamedozer.battalion.data.*;
   import com.gamedozer.battalion.display.*;
   import com.gamedozer.battalion.ui.*;
   import com.gamedozer.battalion.utils.*;
   import flash.display.DisplayObjectContainer;
   import flash.events.MouseEvent;
   import flash.geom.*;
   import flash.ui.*;
   
   public class GameCamera
   {
      
      protected static const BUFFER_TIME:uint = 200;
      
      protected static const WAIT_TIME:uint = 2000;
      
      protected static const TARGET_WAIT_TIME:uint = 1500;
      
      protected static const SCROLL_SPEED:int = 25;
      
      private var scale:Number = 1;
      private var overview:Boolean = false;
      private var priorZoom:Number = 1;
      private var priorX:int = 0;
      private var priorY:int = 0;

      public function get zoom() : Number
      {
         return scale;
      }

      public static function localZoom(a_step:int) : Number
      {
         var game:GameManager = GameManager.getInstance();
         if(game == null || game.getCamera() == null || game.isStillInitializing())
         {
            return 0;
         }
         return game.getCamera().changeZoom(a_step);
      }

      public static function localCameraPan(a_dx:Number, a_dy:Number) : Boolean
      {
         var game:GameManager = GameManager.getInstance();
         if(game == null || game.getCamera() == null || !game.getCamera().isEnabled())
         {
            return false;
         }
         var camera:GameCamera = game.getCamera();
         camera.move(Math.round(a_dx / camera.zoom),Math.round(a_dy / camera.zoom));
         return true;
      }

      private function changeZoom(a_step:int) : Number
      {
         if(a_step == -1 || a_step == 1)
         {
            var minimum:Number = Math.min(1,fitZoom());
            var next:Number = Math.min(2,Math.max(minimum,scale * Math.pow(1.25,a_step)));
            setLocation(cx + (GameManager.GAME_WIDTH / next - visibleWidth()) / 2,
                        cy + (GameManager.GAME_HEIGHT / next - visibleHeight()) / 2);
            scale = next;
            overview = false;
         }
         else if(a_step == 2)
         {
            if(overview)
            {
               scale = priorZoom;
               setLocation(priorX,priorY);
            }
            else
            {
               priorZoom = scale;
               priorX = cx;
               priorY = cy;
               scale = Math.min(2,fitZoom());
               setLocation(0,0);
            }
            overview = !overview;
         }
         return scale;
      }

      private function fitZoom() : Number
      {
         var map:Map = GameManager.getInstance().getMap();
         return Math.min(GameManager.GAME_WIDTH / (map.getWidth() * TileManager.getInstance().getWidth()),
                         GameManager.GAME_HEIGHT / (map.getHeight() * TileManager.getInstance().getHeight()));
      }

      private function visibleWidth() : Number
      {
         return GameManager.GAME_WIDTH / scale;
      }

      private function visibleHeight() : Number
      {
         return GameManager.GAME_HEIGHT / scale;
      }
      
      protected var tx:int;
      
      protected var ty:int;
      
      private var m_scrollLeft:TileSheetButton;
      
      protected var m_scrollButtonX:int = 0;
      
      protected var m_scrollButtonY:int = 0;
      
      protected var target:GameSprite;
      
      protected var targetWaitTime:uint;
      
      private var m_scrollBottomLeft:TileSheetButton;
      
      private var m_scrollTopLeft:TileSheetButton;
      
      protected var cy:int;
      
      protected var defCursor:Boolean;
      
      protected var enabled:Boolean;
      
      private var m_scrollTopRight:TileSheetButton;
      
      protected var time:uint;
      
      private var m_scrollBottomRight:TileSheetButton;
      
      protected var force:Boolean;
      
      private var m_scrollBottom:TileSheetButton;
      
      protected var cx:int;
      
      private var m_scrollTop:TileSheetButton;
      
      protected var x:int;
      
      protected var y:int;
      
      private var m_scrollRight:TileSheetButton;
      
      protected var targetTime:uint;
      
      public function GameCamera()
      {
         super();
         x = y = cx = cy = tx = ty = 0;
         time = 0;
         enabled = false;
         defCursor = false;
         force = false;
      }
      
      private function scrollButtonDown(a_event:MouseEvent) : void
      {
         var name:String = a_event.currentTarget.name;
         var deltaX:int = int(name.split("_")[1]);
         var deltaY:int = int(name.split("_")[2]);
         m_scrollButtonX = deltaX;
         m_scrollButtonY = deltaY;
         a_event.stopPropagation();
      }
      
      public function setTarget(a_gameSprite:GameSprite = null, a_timer:uint = 1500, a_force:Boolean = false) : void
      {
         target = a_gameSprite;
         force = a_force;
         if(target != null)
         {
            tx = -target.x + visibleWidth() / 2;
            ty = -target.y + visibleHeight() / 2;
            time = WAIT_TIME;
         }
         targetTime = 0;
         targetWaitTime = a_timer;
      }
      
      public function attachScrollButtons(a_container:DisplayObjectContainer) : void
      {
         m_scrollLeft = createScrollButton("scroll_edge",-1,0);
         a_container.addChild(m_scrollLeft);
         m_scrollLeft.y = GameManager.GAME_HEIGHT / 2 - m_scrollLeft.height / 2;
         m_scrollRight = createScrollButton("scroll_edge",1,0);
         a_container.addChild(m_scrollRight);
         m_scrollRight.rotation = 180;
         m_scrollRight.x = GameManager.GAME_WIDTH;
         m_scrollRight.y = GameManager.GAME_HEIGHT / 2 + m_scrollLeft.height / 2;
         m_scrollBottom = createScrollButton("scroll_edge",0,1);
         a_container.addChild(m_scrollBottom);
         m_scrollBottom.rotation = 270;
         m_scrollBottom.x = 0 + 1;
         m_scrollBottom.y = GameManager.GAME_HEIGHT - m_scrollBottom.width + 25;
         m_scrollTop = createScrollButton("scroll_edge",0,-1);
         a_container.addChild(m_scrollTop);
         m_scrollTop.rotation = 90;
         m_scrollTop.x = GameManager.GAME_WIDTH - 1;
         m_scrollTopLeft = createScrollButton("scroll_corner",-1,-1);
         a_container.addChild(m_scrollTopLeft);
         m_scrollTopRight = createScrollButton("scroll_corner",1,-1);
         a_container.addChild(m_scrollTopRight);
         m_scrollTopRight.rotation = 90;
         m_scrollTopRight.x = GameManager.GAME_WIDTH;
         m_scrollBottomRight = createScrollButton("scroll_corner",1,1);
         a_container.addChild(m_scrollBottomRight);
         m_scrollBottomRight.rotation = 180;
         m_scrollBottomRight.x = GameManager.GAME_WIDTH;
         m_scrollBottomRight.y = GameManager.GAME_HEIGHT;
         m_scrollBottomLeft = createScrollButton("scroll_corner",-1,1);
         a_container.addChild(m_scrollBottomLeft);
         m_scrollBottomLeft.rotation = 270;
         m_scrollBottomLeft.y = GameManager.GAME_HEIGHT;
      }
      
      public function lock(width:int, height:int) : void
      {
         if(tx < Math.min(0,Math.ceil(visibleWidth() - width)))
         {
            tx = Math.min(0,Math.ceil(visibleWidth() - width));
         }
         if(ty < Math.min(0,Math.ceil(visibleHeight() - height)))
         {
            ty = Math.min(0,Math.ceil(visibleHeight() - height));
         }
         if(tx > 0)
         {
            tx = 0;
         }
         if(ty > 0)
         {
            ty = 0;
         }
         if(cx < Math.min(0,Math.ceil(visibleWidth() - width)))
         {
            cx = Math.min(0,Math.ceil(visibleWidth() - width));
         }
         if(cy < Math.min(0,Math.ceil(visibleHeight() - height)))
         {
            cy = Math.min(0,Math.ceil(visibleHeight() - height));
         }
         if(cx > 0)
         {
            cx = 0;
         }
         if(cy > 0)
         {
            cy = 0;
         }
      }
      
      private function updateScrollButtonVisiblity() : void
      {
         var width:int = GameManager.getInstance().getMap().getWidth() * TileManager.getInstance().getWidth();
         var height:int = GameManager.getInstance().getMap().getHeight() * TileManager.getInstance().getHeight();
         m_scrollTopLeft.visible = true;
         m_scrollTopRight.visible = true;
         m_scrollBottomRight.visible = true;
         m_scrollBottomLeft.visible = true;
         m_scrollTop.visible = true;
         m_scrollRight.visible = true;
         m_scrollBottom.visible = true;
         m_scrollLeft.visible = true;
         if(cx == Math.min(0,Math.ceil(visibleWidth() - width)) && cy == 0)
         {
            m_scrollTopRight.visible = false;
         }
         if(cx == Math.min(0,Math.ceil(visibleWidth() - width)) && cy == Math.min(0,Math.ceil(visibleHeight() - height)))
         {
            m_scrollBottomRight.visible = false;
         }
         if(cx == 0 && cy == 0)
         {
            m_scrollTopLeft.visible = false;
         }
         if(cx == 0 && cy == Math.min(0,Math.ceil(visibleHeight() - height)))
         {
            m_scrollBottomLeft.visible = false;
         }
         if(cx == Math.min(0,Math.ceil(visibleWidth() - width)))
         {
            m_scrollRight.visible = false;
         }
         if(cy == Math.min(0,Math.ceil(visibleHeight() - height)))
         {
            m_scrollBottom.visible = false;
         }
         if(cx == 0)
         {
            m_scrollLeft.visible = false;
         }
         if(cy == 0)
         {
            m_scrollTop.visible = false;
         }
      }
      
      public function isEnabled() : Boolean
      {
         return enabled;
      }
      
      public function setLocation(a_x:int, a_y:int) : void
      {
         cx = a_x;
         cy = a_y;
         time = 0;
         target = null;
      }
      
      public function getX() : int
      {
         return x;
      }
      
      public function getY() : int
      {
         return y;
      }
      
      public function update(a_ms:uint = 0) : void
      {
         var dx:int = 0;
         var dy:int = 0;
         var c:String = null;
         var gameManager:GameManager = GameManager.getInstance();
         var gss:GameSpriteScroller = gameManager.getGameSpriteScroller();
         var width:int = gameManager.getMap().getWidth() * TileManager.getInstance().getWidth();
         var height:int = gameManager.getMap().getHeight() * TileManager.getInstance().getHeight();
         time += a_ms;
         targetTime += a_ms;
         if(targetTime < targetWaitTime)
         {
            if(target != null)
            {
               tx = -target.x + visibleWidth() / 2;
               ty = -target.y + visibleHeight() / 2;
            }
         }
         else
         {
            target = null;
         }
         updateScrollButtonVisiblity();
         if(enabled && !force)
         {
            if(KeyboardHandler.getInstance().isDown(Keyboard.UP))
            {
               cy += SCROLL_SPEED;
               time = 0;
            }
            if(KeyboardHandler.getInstance().isDown(Keyboard.DOWN))
            {
               cy -= SCROLL_SPEED;
               time = 0;
            }
            if(KeyboardHandler.getInstance().isDown(Keyboard.LEFT))
            {
               cx += SCROLL_SPEED;
               time = 0;
            }
            if(KeyboardHandler.getInstance().isDown(Keyboard.RIGHT))
            {
               cx -= SCROLL_SPEED;
               time = 0;
            }
            if(MouseHandler.getInstance().isEnabled())
            {
               cx += SCROLL_SPEED * m_scrollButtonX * -1;
               cy += SCROLL_SPEED * m_scrollButtonY * -1;
            }
            else
            {
               hideScrollButtons();
            }
         }
         else
         {
            time = WAIT_TIME + 1;
            hideScrollButtons();
         }
         lock(width,height);
         var scrolled:Boolean = false;
         if(time > WAIT_TIME && target != null)
         {
            dx = cx = tx;
            dy = cy = ty;
         }
         else
         {
            dx = cx;
            dy = cy;
            scrolled = true;
            force = false;
         }
         var ax:Number = x;
         var ay:Number = y;
         x = Math.abs(dx - x) <= 1 ? dx : x + (dx - x) / 2;
         y = Math.abs(dy - y) <= 1 ? dy : y + (dy - y) / 2;
         gameManager.getMiniMap().setViewportZoom(scale);
         gameManager.getMiniMap().setDrag(-x,-y);
         gss.scaleX = gss.scaleY = scale;
         gss.x = x * scale;
         gss.y = y * scale;
         gss.scroll();
         ax = x - ax;
         ay = y - ay;
         if(scrolled)
         {
            c = "";
            if(ax < 0)
            {
               c += "right";
            }
            if(ax > 0)
            {
               c += "left";
            }
            if(ay < 0)
            {
               c += "down";
            }
            if(ay > 0)
            {
               c += "up";
            }
            if(c != "")
            {
               BattalionMain.getMouseCursor().setCursor(c);
               defCursor = true;
            }
            else if(defCursor)
            {
               BattalionMain.getMouseCursor().setCursor("default");
               defCursor = false;
            }
         }
      }
      
      public function move(a_x:int = 0, a_y:int = 0) : void
      {
         setLocation(cx + a_x,cy + a_y);
      }
      
      private function scrollButtonOver(a_event:MouseEvent) : void
      {
         a_event.currentTarget.alpha = 1;
      }
      
      private function hideScrollButtons() : void
      {
         m_scrollTopLeft.visible = false;
         m_scrollTopRight.visible = false;
         m_scrollBottomRight.visible = false;
         m_scrollBottomLeft.visible = false;
         m_scrollTop.visible = false;
         m_scrollRight.visible = false;
         m_scrollBottom.visible = false;
         m_scrollLeft.visible = false;
      }
      
      private function scrollButtonUp(a_event:MouseEvent) : void
      {
         m_scrollButtonX = 0;
         m_scrollButtonY = 0;
      }
      
      private function scrollButtonOut(a_event:MouseEvent) : void
      {
         m_scrollButtonX = 0;
         m_scrollButtonY = 0;
         a_event.currentTarget.alpha = 0;
      }
      
      private function createScrollButton(a_type:String, a_directionX:int, a_directionY:int) : TileSheetButton
      {
         var btn:TileSheetButton = new TileSheetButton(a_type);
         btn.name = "scroll_" + a_directionX + "_" + a_directionY;
         btn.enable();
         btn.addEventListener(MouseEvent.MOUSE_DOWN,scrollButtonDown);
         btn.addEventListener(MouseEvent.MOUSE_UP,scrollButtonUp);
         btn.addEventListener(MouseEvent.MOUSE_OUT,scrollButtonOut);
         btn.addEventListener(MouseEvent.MOUSE_OVER,scrollButtonOver);
         btn.alpha = 0;
         return btn;
      }
      
      public function setEnabled(a_enabled:Boolean) : void
      {
         enabled = a_enabled;
      }
   }
}

