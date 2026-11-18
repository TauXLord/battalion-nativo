package com.gamedozer.battalion
{
   import com.gamedozer.battalion.ui.MenuManager;
   import com.gamedozer.battalion.game.GameCamera;
   import flash.display.Bitmap;
   import flash.display.Sprite;
   import flash.external.ExternalInterface;
   
   public class Ep2Main extends BattalionMain
   {
      
      public function Ep2Main()
      {
         super(new Ep2Context());
      }
      
      private function finishSplash() : void
      {
         screen = new Sprite();
         this.addChild(screen);
         s_modeManager = new MenuManager(screen);
         if(ExternalInterface.available)
         {
            ExternalInterface.addCallback("localZoom",GameCamera.localZoom);
            ExternalInterface.addCallback("localCameraPan",GameCamera.localCameraPan);
         }
         BattalionMain.MODE_MANAGER.pushMode(MenuManager.mainMenu,null);
         updateSoundSystem();
      }
      
      override protected function start() : void
      {
         var splash:ExplodingSplash = null;
         if(!ALLOW_DEBUG)
         {
            splash = new ExplodingSplash(new Bitmap(new splash_bunny_batt(0,0)),true,finishSplash);
            this.addChild(splash);
         }
         else
         {
            finishSplash();
         }
      }
   }
}


